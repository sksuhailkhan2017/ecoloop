# python/ — data tooling

Offline helpers for the shared `data/` folder. Nothing here runs in production; the app itself is
the Next.js app in `frontend/`.

| Script | Purpose |
|---|---|
| `scripts/validate_rules.py` | Validates `data/markham_rules.json` against the schema in `docs/SPEC.md` §6, prints a per-stream breakdown and how many entries are still `"verified": false`. Run before every demo (`npm run validate:rules` from the repo root). |
| `scripts/generate_rules.py` | Not implemented: the knowledge base already has 146 hand-written entries, so generation was not needed. Kept as a stub in case the list is ever rebuilt. |

## Setup

```powershell
cd python
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```powershell
python scripts/validate_rules.py                 # validates ../data/markham_rules.json
python scripts/validate_rules.py path\to\other.json
```

`generate_rules.py` needs `GEMINI_API_KEY` in `python/.env` (copy `.env.example`).

> Verify rules against markham.ca "What Goes Where" before demo.
