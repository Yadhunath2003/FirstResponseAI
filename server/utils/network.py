import os
import socket
import subprocess


CERTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "certs")
CERT_FILE = os.path.join(CERTS_DIR, "cert.pem")
KEY_FILE = os.path.join(CERTS_DIR, "key.pem")


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_server_url(port: int) -> str:
    return f"https://{get_local_ip()}:{port}"


def generate_qr(url: str):
    try:
        import qrcode
        qr = qrcode.QRCode(border=1)
        qr.add_data(url)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
    except ImportError:
        print(f"  (Install 'qrcode' for QR code: pip install qrcode)")


def ensure_ssl_certs() -> tuple[str, str]:
    """Generate self-signed SSL certs if they don't exist. Returns (certfile, keyfile)."""
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return CERT_FILE, KEY_FILE

    os.makedirs(CERTS_DIR, exist_ok=True)
    ip = get_local_ip()

    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048",
        "-keyout", KEY_FILE,
        "-out", CERT_FILE,
        "-days", "365",
        "-nodes",
        "-subj", f"/CN={ip}",
        "-addext", f"subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost",
    ], check=True, capture_output=True)

    print(f"  SSL certs generated in certs/")
    return CERT_FILE, KEY_FILE
