"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Participant,
  type LocalAudioTrack,
  type RemoteParticipant,
} from "livekit-client";
import { api } from "./api";

// LiveKit-backed talkgroup for one (incident, channel) room.
//
// Each hook instance manages exactly one Room connection. The model maps
// cleanly onto CAD/LMR talkgroups:
//   - Responder units mount one hook for their currently-tuned channel and
//     change `channelId` to switch (reconnect under the hood).
//   - Dashboard mounts four hooks (one per channel) with canPublish=false
//     to monitor every talkgroup simultaneously.
//
// Remote audio is attached via LiveKit's `track.attach()`, which creates a
// standard HTMLMediaElement — echo cancellation works correctly because the
// audio path matches the OS loopback reference.
interface UseChannelRoomOpts {
  incidentId: string | null;
  channelId: string | null;
  unitId: string | null;
  callsign?: string | null;
  enabled?: boolean;
  // Listen-only participants (e.g., dashboard) get a token with no publish grant.
  canPublish?: boolean;
}

export interface ChannelRoomState {
  connected: boolean;
  micOn: boolean;
  // Participant identities currently transmitting (live on the channel).
  speakers: string[];
  // Remote participant count (excludes self).
  participantCount: number;
  // Key the mic on/off — LiveKit publishes/unpublishes an audio track. No
  // renegotiation is visible to callers; feels instantaneous.
  setMicEnabled: (on: boolean) => Promise<void>;
  // Expose the raw mic stream so existing PTT capture can reuse it for the
  // transcript upload without re-prompting for permission.
  getLocalStream: () => MediaStream | null;
}

export function useChannelRoom({
  incidentId,
  channelId,
  unitId,
  callsign,
  enabled = true,
  canPublish = true,
}: UseChannelRoomOpts): ChannelRoomState {
  const [connected, setConnected] = useState(false);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [micOn, setMicOn] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const sinksRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const localTrackRef = useRef<LocalAudioTrack | null>(null);

  useEffect(() => {
    if (!enabled || !incidentId || !channelId || !unitId) return;

    let cancelled = false;
    const room = new Room({
      adaptiveStream: false,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;
    const sinks = sinksRef.current;

    const onTrackSubscribed = (
      track: RemoteTrack,
      _pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach() as HTMLMediaElement;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      el.style.display = "none";
      document.body.appendChild(el);
      sinks.set(`${participant.identity}:${track.sid}`, el);
    };

    const onTrackUnsubscribed = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      for (const [k, v] of sinks.entries()) {
        if (!v.isConnected) sinks.delete(k);
      }
    };

    const onActiveSpeakersChanged = (parts: Participant[]) => {
      setSpeakers(parts.map((p) => p.identity));
    };
    const refreshCount = () => setParticipantCount(room.numParticipants - 1);

    room
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
      .on(RoomEvent.ParticipantConnected, refreshCount)
      .on(RoomEvent.ParticipantDisconnected, refreshCount)
      .on(RoomEvent.Disconnected, () => setConnected(false));

    (async () => {
      try {
        const { url, token } = await api.getLivekitToken({
          incidentId,
          channelId,
          unitId,
          callsign: callsign ?? unitId,
          canPublish,
          canSubscribe: true,
        });
        if (cancelled) return;
        await room.connect(url, token, { autoSubscribe: true });
        if (cancelled) {
          await room.disconnect(true);
          return;
        }
        setConnected(true);
        refreshCount();
      } catch (err) {
        console.warn("livekit connect failed", err);
      }
    })();

    return () => {
      cancelled = true;
      setConnected(false);
      setSpeakers([]);
      setMicOn(false);
      setParticipantCount(0);
      for (const el of sinks.values()) el.remove();
      sinks.clear();
      localTrackRef.current = null;
      room.disconnect(true).catch(() => {});
      roomRef.current = null;
    };
  }, [enabled, incidentId, channelId, unitId, callsign, canPublish]);

  const setMicEnabled = useCallback(
    async (on: boolean) => {
      const room = roomRef.current;
      if (!room || !canPublish) return;
      try {
        await room.localParticipant.setMicrophoneEnabled(on);
        const pub = room.localParticipant.getTrackPublication(
          Track.Source.Microphone,
        );
        localTrackRef.current = (pub?.track as LocalAudioTrack) ?? null;
        setMicOn(on);
      } catch (err) {
        console.warn("setMicEnabled failed", err);
      }
    },
    [canPublish],
  );

  const getLocalStream = useCallback((): MediaStream | null => {
    const t = localTrackRef.current;
    if (!t || !t.mediaStreamTrack) return null;
    return new MediaStream([t.mediaStreamTrack]);
  }, []);

  return {
    connected,
    micOn,
    speakers,
    participantCount,
    setMicEnabled,
    getLocalStream,
  };
}
