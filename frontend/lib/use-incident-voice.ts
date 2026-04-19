"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WSMessage } from "./types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

interface UseIncidentVoiceOpts {
  unitId: string | null;
  send: (msg: object) => boolean;
  enabled?: boolean;
  // Dashboard: skip mic, recv-only. Responder: false (default).
  receiveOnly?: boolean;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement | null;
  // Candidates that arrived before setRemoteDescription.
  pendingCandidates: RTCIceCandidateInit[];
}

// Mesh WebRTC for live voice within an incident.
//   - Each pair of units opens a direct peer connection.
//   - The unit with the lexicographically smaller id initiates the offer
//     (glare avoidance).
//   - Signaling piggybacks on the incident WebSocket via send({type:"signal",...}).
//   - Outbound mic track is kept attached but disabled by default; transmit(on)
//     toggles `track.enabled` — zero setup cost when you start talking.
//   - micStream is returned so the existing MediaRecorder PTT flow can reuse
//     the same getUserMedia result for transcript/storage.
export function useIncidentVoice({
  unitId,
  send,
  enabled = true,
  receiveOnly = false,
}: UseIncidentVoiceOpts) {
  const [micReady, setMicReady] = useState(false);
  const [peerCount, setPeerCount] = useState(0);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const unitIdRef = useRef(unitId);
  const sendRef = useRef(send);

  useEffect(() => {
    unitIdRef.current = unitId;
  }, [unitId]);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Acquire mic once (responder only). Track is added to every peer connection
  // with enabled=false so turning transmit on is instantaneous.
  useEffect(() => {
    if (!enabled || receiveOnly) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const track = stream.getAudioTracks()[0];
        if (track) track.enabled = false;
        micStreamRef.current = stream;
        micTrackRef.current = track ?? null;
        setMicReady(true);
      } catch (err) {
        console.warn("mic unavailable", err);
      }
    })();
    return () => {
      cancelled = true;
      const stream = micStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      micTrackRef.current = null;
      setMicReady(false);
    };
  }, [enabled, receiveOnly]);

  const ensurePeer = useCallback(
    (peerId: string): PeerEntry => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        sendRef.current({
          type: "signal",
          to: peerId,
          data: { kind: "candidate", candidate: ev.candidate.toJSON() },
        });
      };

      pc.ontrack = (ev) => {
        const entry = peersRef.current.get(peerId);
        if (!entry) return;
        if (!entry.audioEl) {
          const el = new Audio();
          el.autoplay = true;
          // iOS requires playsInline for inline audio playback on some flows.
          el.setAttribute("playsinline", "true");
          entry.audioEl = el;
        }
        entry.audioEl.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
        entry.audioEl.play().catch((e) => console.warn("remote play", e));
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.connectionState === "disconnected"
        ) {
          // Leave cleanup for peer_left / unmount to avoid thrash on transient blips.
        }
      };

      // Always add our outbound mic (if we have one) so renegotiation isn't needed later.
      const track = micTrackRef.current;
      if (track && micStreamRef.current) {
        pc.addTrack(track, micStreamRef.current);
      } else if (receiveOnly) {
        // Dashboard: declare we'll only receive. Without this Safari sometimes
        // fails to set remote description on an offer containing audio.
        pc.addTransceiver("audio", { direction: "recvonly" });
      }

      const entry: PeerEntry = { pc, audioEl: null, pendingCandidates: [] };
      peersRef.current.set(peerId, entry);
      setPeerCount(peersRef.current.size);
      return entry;
    },
    [receiveOnly],
  );

  const closePeer = useCallback((peerId: string) => {
    const entry = peersRef.current.get(peerId);
    if (!entry) return;
    try {
      entry.pc.close();
    } catch {
      /* ignore */
    }
    if (entry.audioEl) {
      try {
        entry.audioEl.pause();
        entry.audioEl.srcObject = null;
      } catch {
        /* ignore */
      }
    }
    peersRef.current.delete(peerId);
    setPeerCount(peersRef.current.size);
  }, []);

  const amInitiator = useCallback((peerId: string): boolean => {
    const me = unitIdRef.current;
    if (!me) return false;
    return me < peerId;
  }, []);

  const makeOffer = useCallback(async (peerId: string) => {
    const entry = ensurePeer(peerId);
    try {
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      sendRef.current({
        type: "signal",
        to: peerId,
        data: { kind: "offer", sdp: offer.sdp, sdpType: offer.type },
      });
    } catch (err) {
      console.warn("makeOffer failed", err);
    }
  }, [ensurePeer]);

  const handleOffer = useCallback(
    async (fromId: string, sdp: string, sdpType: RTCSdpType) => {
      const entry = ensurePeer(fromId);
      try {
        await entry.pc.setRemoteDescription({ type: sdpType, sdp });
        for (const c of entry.pendingCandidates.splice(0)) {
          await entry.pc.addIceCandidate(c).catch(() => {});
        }
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        sendRef.current({
          type: "signal",
          to: fromId,
          data: { kind: "answer", sdp: answer.sdp, sdpType: answer.type },
        });
      } catch (err) {
        console.warn("handleOffer failed", err);
      }
    },
    [ensurePeer],
  );

  const handleAnswer = useCallback(
    async (fromId: string, sdp: string, sdpType: RTCSdpType) => {
      const entry = peersRef.current.get(fromId);
      if (!entry) return;
      try {
        await entry.pc.setRemoteDescription({ type: sdpType, sdp });
        for (const c of entry.pendingCandidates.splice(0)) {
          await entry.pc.addIceCandidate(c).catch(() => {});
        }
      } catch (err) {
        console.warn("handleAnswer failed", err);
      }
    },
    [],
  );

  const handleCandidate = useCallback(
    async (fromId: string, candidate: RTCIceCandidateInit) => {
      const entry = peersRef.current.get(fromId);
      if (!entry) return;
      if (!entry.pc.remoteDescription) {
        entry.pendingCandidates.push(candidate);
        return;
      }
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn("addIceCandidate failed", err);
      }
    },
    [],
  );

  // Dispatched from the page's handleMessage for ws events we care about.
  const onWsMessage = useCallback(
    (rawMsg: WSMessage) => {
      if (!enabled || !unitIdRef.current) return;
      const msg = rawMsg as unknown as {
        type: string;
        peer_ids?: string[];
        peer_id?: string;
        from?: string;
        data?: {
          kind: "offer" | "answer" | "candidate";
          sdp?: string;
          sdpType?: RTCSdpType;
          candidate?: RTCIceCandidateInit;
        };
      };
      switch (msg.type) {
        case "peers": {
          for (const pid of msg.peer_ids ?? []) {
            if (pid === unitIdRef.current) continue;
            ensurePeer(pid);
            if (amInitiator(pid)) makeOffer(pid);
          }
          break;
        }
        case "peer_joined": {
          const pid = msg.peer_id;
          if (!pid || pid === unitIdRef.current) break;
          ensurePeer(pid);
          if (amInitiator(pid)) makeOffer(pid);
          break;
        }
        case "peer_left": {
          const pid = msg.peer_id;
          if (pid) closePeer(pid);
          break;
        }
        case "signal": {
          const from = msg.from;
          const data = msg.data;
          if (!from || !data || typeof data !== "object") break;
          if (data.kind === "offer" && data.sdp && data.sdpType) {
            handleOffer(from, data.sdp, data.sdpType);
          } else if (data.kind === "answer" && data.sdp && data.sdpType) {
            handleAnswer(from, data.sdp, data.sdpType);
          } else if (data.kind === "candidate" && data.candidate) {
            handleCandidate(from, data.candidate);
          }
          break;
        }
      }
    },
    [enabled, ensurePeer, amInitiator, makeOffer, closePeer, handleOffer, handleAnswer, handleCandidate],
  );

  const transmit = useCallback((on: boolean) => {
    const track = micTrackRef.current;
    if (track) track.enabled = on;
  }, []);

  // Must be called from inside a user-gesture handler on browsers (esp. Safari)
  // that refuse autoplay on <audio> even with `autoplay` set. Forces a play()
  // on every existing remote element; any already-attached stream becomes
  // audible and future attachments inherit the unlocked state.
  const unlockAudio = useCallback(() => {
    for (const entry of peersRef.current.values()) {
      const el = entry.audioEl;
      if (el) el.play().catch(() => {});
    }
  }, []);

  // Close everything on unmount.
  useEffect(() => {
    return () => {
      for (const id of Array.from(peersRef.current.keys())) {
        closePeer(id);
      }
    };
  }, [closePeer]);

  return {
    onWsMessage,
    transmit,
    unlockAudio,
    micReady,
    peerCount,
    getMicStream: useCallback(() => micStreamRef.current, []),
  };
}
