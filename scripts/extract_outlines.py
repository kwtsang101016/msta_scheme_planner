from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Optional


@dataclass(frozen=True)
class OutlineDoc:
    course_code: str
    source_path: str
    source_type: str  # pdf|doc|docx|txt
    text: str
    prerequisites_raw: Optional[str]


COURSE_CODE_RE = re.compile(r"\b([A-Z]{3}\d{4})\b")


def _read_pdf_text(path: Path) -> str:
    # Prefer extracting embedded text; many CUHK-SZ outlines are text-based PDFs.
    try:
        import pdfplumber  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError(
            "Missing dependency pdfplumber. Install requirements.txt."
        ) from e

    chunks: list[str] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            if txt.strip():
                chunks.append(txt)
    return "\n\n".join(chunks).strip()


def _word_to_txt_via_com(path: Path) -> Optional[str]:
    """
    Try extracting Word text via Windows COM automation.
    Returns None if Word automation is unavailable.
    """
    try:
        import win32com.client  # type: ignore
    except Exception:
        return None

    # On some systems, "Word.Application" may be provided by WPS/Kingsoft and can fail.
    # We try a small set of common ProgIDs.
    prog_ids = ["Word.Application", "KWPS.Application", "wps.Application"]
    for prog_id in prog_ids:
        word = None
        doc = None
        try:
            word = win32com.client.Dispatch(prog_id)
            word.Visible = False
            try:
                word.DisplayAlerts = 0
            except Exception:
                pass
            doc = word.Documents.Open(str(path), ReadOnly=True)
            tmp_txt = path.with_suffix(f".__tmp_extracted_{prog_id.replace('.', '_')}.txt")
            wdFormatText = 2
            doc.SaveAs(str(tmp_txt), FileFormat=wdFormatText)
            txt = tmp_txt.read_text(encoding="utf-8", errors="ignore")
            try:
                tmp_txt.unlink(missing_ok=True)  # py3.8+
            except TypeError:  # pragma: no cover
                if tmp_txt.exists():
                    tmp_txt.unlink()
            if txt.strip():
                return txt.strip()
        except Exception:
            continue
        finally:
            try:
                if doc is not None:
                    doc.Close(False)
            except Exception:
                pass
            try:
                if word is not None:
                    word.Quit()
            except Exception:
                pass
    return None


def _word_to_txt_via_textract(path: Path) -> Optional[str]:
    """
    Fallback extractor. Requires external helpers depending on file type.
    On Windows, this often works only when the system has the right tools installed.
    """
    try:
        import textract  # type: ignore
    except Exception:
        return None
    try:
        data = textract.process(str(path))
        return data.decode("utf-8", errors="ignore").strip()
    except Exception:
        return None


def _read_doc_binary_best_effort(path: Path) -> Optional[str]:
    """
    Last-resort extraction for legacy .doc when COM automation and proper converters
    are unavailable. This tries to recover human-readable strings from the binary.
    It's imperfect but often enough to capture course code + prerequisites lines.
    """
    if path.suffix.lower() != ".doc":
        return None
    data = path.read_bytes()
    candidates: list[str] = []
    for enc in ("utf-16le", "utf-8", "cp1252", "latin1"):
        try:
            s = data.decode(enc, errors="ignore")
        except Exception:
            continue
        # Keep sequences of reasonably long printable runs.
        runs = re.findall(r"[ -~\u4e00-\u9fff]{8,}", s)
        if runs:
            candidates.append("\n".join(runs))
    if not candidates:
        return None
    # Prefer the candidate with the most signal.
    best = max(candidates, key=len)
    best = re.sub(r"\n{3,}", "\n\n", best)
    return best.strip() or None


def _read_word_text(path: Path) -> str:
    txt = _word_to_txt_via_com(path)
    if txt and txt.strip():
        return txt
    txt = _word_to_txt_via_textract(path)
    if txt and txt.strip():
        return txt
    txt = _read_doc_binary_best_effort(path)
    if txt and txt.strip():
        return txt
    raise RuntimeError(
        f"Failed to extract text from Word file: {path}. "
        "Install Microsoft Word (for COM extraction) or configure textract helpers."
    )


def _infer_course_code(path: Path, text: str) -> str:
    # Prefer from filename, else from content.
    m = COURSE_CODE_RE.search(path.name.upper())
    if m:
        return m.group(1)
    m2 = COURSE_CODE_RE.search(text.upper())
    if m2:
        return m2.group(1)
    raise RuntimeError(f"Could not infer course code for {path}")


def _extract_prerequisites_block(text: str) -> Optional[str]:
    # Robust-ish extraction for common CUHK-SZ outline template.
    # Looks for "Prerequisites" section and captures until the next labeled block.
    # Primary: extract the content between "A. Prerequisites" and "B. Co-requisites".
    m = re.search(
        r"A\.\s*Prerequisites\s*(?P<prereq>[\s\S]{0,600}?)\s*B\.\s*Co-?requisites",
        text,
        flags=re.IGNORECASE,
    )
    if m:
        prereq = re.sub(r"\s+", " ", (m.group("prereq") or "")).strip()
        # Many outlines leave it blank. Treat blank as "not stated" instead of leaking next sections.
        if prereq:
            return prereq
        return ""

    # Fallback: capture a short window after "2. Prerequisites / Co-requisites" and then try to re-extract.
    m2 = re.search(
        r"2\.\s*Prerequisites\s*/\s*Co-?requisites(?P<body>[\s\S]{0,900})",
        text,
        flags=re.IGNORECASE,
    )
    if m2:
        body = m2.group("body")
        m3 = re.search(
            r"A\.\s*Prerequisites\s*(?P<prereq>[\s\S]{0,600}?)\s*B\.\s*Co-?requisites",
            body,
            flags=re.IGNORECASE,
        )
        if m3:
            prereq = re.sub(r"\s+", " ", (m3.group("prereq") or "")).strip()
            return prereq
        # If we can't find the A/B markers, do NOT return the whole body (often includes learning outcomes etc.).
        return ""

    return None


def iter_outline_files(outlines_dir: Path) -> Iterable[Path]:
    for ext in (".pdf", ".doc", ".docx"):
        yield from sorted(outlines_dir.glob(f"*{ext}"))


def extract_all(outlines_dir: Path) -> list[OutlineDoc]:
    docs: list[OutlineDoc] = []
    for path in iter_outline_files(outlines_dir):
        suffix = path.suffix.lower()
        if suffix == ".pdf":
            text = _read_pdf_text(path)
            source_type = "pdf"
        elif suffix in (".doc", ".docx"):
            text = _read_word_text(path)
            source_type = suffix.lstrip(".")
        else:
            continue
        course_code = _infer_course_code(path, text)
        prereq = _extract_prerequisites_block(text)
        docs.append(
            OutlineDoc(
                course_code=course_code,
                source_path=str(path),
                source_type=source_type,
                text=text,
                prerequisites_raw=prereq,
            )
        )
    return docs


def main() -> int:
    outlines_dir = Path("Course outline for MSTA") / "Course outline for MSTA"
    if not outlines_dir.exists():
        print(f"Outlines directory not found: {outlines_dir}", file=sys.stderr)
        return 2

    docs = extract_all(outlines_dir)
    out_path = Path("artifacts")
    out_path.mkdir(exist_ok=True)
    (out_path / "outlines.json").write_text(
        json.dumps([asdict(d) for d in docs], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(docs)} outlines to {out_path / 'outlines.json'}")
    # Convenience: also write a compact prereq map.
    prereq_map = {d.course_code: (d.prerequisites_raw or "") for d in docs}
    (out_path / "prerequisites.json").write_text(
        json.dumps(prereq_map, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
