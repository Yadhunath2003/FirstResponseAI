#!/usr/bin/env python3
import sys
import os
import subprocess
import shutil


def main():
    print("\n  FirstResponse AI — Setup\n")

    # Check Python version
    if sys.version_info < (3, 11):
        print(f"  ERROR: Python 3.11+ required (you have {sys.version})")
        sys.exit(1)
    print(f"  Python {sys.version_info.major}.{sys.version_info.minor} ✓")

    # Install requirements
    print("  Installing dependencies...")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-q"],
    )
    print("  Dependencies installed ✓")

    # Create .env if it doesn't exist
    if not os.path.exists(".env"):
        shutil.copy(".env.example", ".env")
        print("  Created .env from .env.example")

        api_key = input("\n  Enter your Anthropic API key (or press Enter to skip): ").strip()
        if api_key:
            with open(".env", "r") as f:
                content = f.read()
            content = content.replace("sk-ant-your-key-here", api_key)
            with open(".env", "w") as f:
                f.write(content)
            print("  API key saved ✓")
        else:
            print("  Skipped — edit .env later to add your key")
    else:
        print("  .env already exists ✓")

    # Create data directory
    os.makedirs("data", exist_ok=True)

    # Generate SSL certs
    print("  Generating SSL certificates...")
    try:
        from server.utils.network import ensure_ssl_certs, get_server_url, generate_qr
        ensure_ssl_certs()
        print("  SSL certs ready ✓")
    except Exception as e:
        print(f"  SSL cert generation failed: {e}")
        print("  Make sure openssl is installed")

    # Print run instructions
    print(f"\n  {'='*46}")
    print(f"  Setup complete!")
    print(f"  ")
    print(f"  Run the server:")
    print(f"    python run.py")
    print(f"  ")
    print(f"  Then open the URL shown in terminal on your phone.")
    print(f"  Accept the self-signed certificate warning.")
    print(f"  {'='*46}\n")

    # Show QR code
    try:
        url = get_server_url(8000)
        print(f"  Server will be at: {url}\n")
        generate_qr(url)
    except Exception:
        pass


if __name__ == "__main__":
    main()
