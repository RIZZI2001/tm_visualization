"""Fetch /data using `server/request.json` and print a readable table to the console.

Usage:
    pip install requests pandas tabulate
    python server/scripts/show_response_table.py

Optional: add `--html` to save/open an HTML preview.
"""
import json
import requests
import pandas as pd
import argparse
from io import StringIO
from pathlib import Path
import webbrowser

ROOT = Path(__file__).resolve().parents[2]
REQ_PATH = ROOT / "server" / "request.json"
OUT_HTML = ROOT / "server" / "out_table.html"
API_URL = "http://127.0.0.1:8000/data"


def fetch_response():
    payload = json.loads(REQ_PATH.read_text())
    resp = requests.get(API_URL, params={"attribute": json.dumps(payload)})
    resp.raise_for_status()
    # The API may return plain CSV text or a JSON object like {"csv": "...", "axis": [...]}
    text = resp.text
    try:
        obj = json.loads(text)
    except Exception:
        return text, None

    # If it's a JSON wrapper with a csv key, extract it
    if isinstance(obj, dict) and "csv" in obj:
        return obj.get("csv", ""), obj.get("axis")
    # Otherwise fall back to returning the raw text
    return text, None


def print_table(text, max_rows=200):
    df = pd.read_csv(StringIO(text), dtype=str)
    # limit rows for readability
    if len(df) > max_rows:
        print(f"Showing first {max_rows} of {len(df)} rows:")
        print(df.head(max_rows).to_markdown())
    else:
        print(df.to_markdown())
    return df


def save_html(df):
    html = df.to_html(index=True, classes="table table-striped")
    full = f"<html><head><meta charset='utf-8'><link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'></head><body><div class='container'><h2>API Response</h2>{html}</div></body></html>"
    OUT_HTML.write_text(full, encoding='utf-8')
    webbrowser.open(OUT_HTML.as_uri())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--html", action="store_true", help="Save and open HTML preview")
    parser.add_argument("--rows", type=int, default=200, help="Number of rows to display in terminal")
    args = parser.parse_args()

    text, axis = fetch_response()
    df = print_table(text, max_rows=args.rows)
    # Print axis metadata after the CSV table when present
    if axis is not None:
        try:
            pretty = json.dumps(axis, indent=2)
        except Exception:
            pretty = str(axis)
        print("\nAxis metadata:")
        print(pretty)

    if args.html:
        save_html(df)


if __name__ == '__main__':
    main()
