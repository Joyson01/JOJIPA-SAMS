"""
capture_face.py — Capture your photo via webcam and register your face embedding.

Can be run via GUI dialog or CLI:
    python capture_face.py
    python capture_face.py --eid joy --name "Joyson"
"""

import argparse
import os
import sys
import tkinter as tk
from tkinter import messagebox, simpledialog, ttk
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis

# Robust project root detection (works if file is in root or in src/)
_CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = _CURRENT_DIR if (_CURRENT_DIR / "src").is_dir() else _CURRENT_DIR.parent

STUDENT_DIR = PROJECT_DIR / "data" / "students"
EMBEDDINGS_DIR = PROJECT_DIR / "embeddings"

# Ensure src/ is on Python search path
SRC_DIR = PROJECT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import attendance_db


def _insightface_root() -> str:
    """Return a writable InsightFace model root."""
    root = os.path.expanduser("~/.insightface")
    try:
        os.makedirs(root, exist_ok=True)
        probe = Path(root) / ".write_test"
        probe.touch()
        probe.unlink()
        return root
    except (OSError, PermissionError):
        return str(PROJECT_DIR / ".insightface")


def gui_prompt_credentials() -> tuple[str, str] | tuple[None, None]:
    """Pop up a Tkinter GUI dialog to collect Enrollment ID and Name."""
    root = tk.Tk()
    root.title("SAMS — Student Enrollment")
    root.geometry("380x230")
    root.resizable(False, False)

    # Centre window on screen
    root.update_idletasks()
    width = root.winfo_width()
    height = root.winfo_height()
    x = (root.winfo_screenwidth() // 2) - (width // 2)
    y = (root.winfo_screenheight() // 2) - (height // 2)
    root.geometry(f"{width}x{height}+{x}+{y}")

    result = {"eid": None, "name": None}

    style = ttk.Style()
    style.theme_use("clam")

    main_frame = ttk.Frame(root, padding=20)
    main_frame.pack(fill="both", expand=True)

    title_label = ttk.Label(
        main_frame,
        text="Register New Student",
        font=("Helvetica", 14, "bold"),
    )
    title_label.grid(row=0, column=0, columnspan=2, pady=(0, 15), sticky="w")

    # EID input
    ttk.Label(main_frame, text="Enrollment ID (EID):", font=("Helvetica", 10)).grid(
        row=1, column=0, sticky="w", pady=5
    )
    eid_entry = ttk.Entry(main_frame, width=22)
    eid_entry.grid(row=1, column=1, sticky="e", pady=5)
    eid_entry.focus()

    # Name input
    ttk.Label(main_frame, text="Full Name:", font=("Helvetica", 10)).grid(
        row=2, column=0, sticky="w", pady=5
    )
    name_entry = ttk.Entry(main_frame, width=22)
    name_entry.grid(row=2, column=1, sticky="e", pady=5)

    def on_submit():
        eid_val = eid_entry.get().strip()
        name_val = name_entry.get().strip()

        if not eid_val:
            messagebox.showerror("Error", "Enrollment ID (EID) cannot be empty!", parent=root)
            return
        if not name_val:
            messagebox.showerror("Error", "Full Name cannot be empty!", parent=root)
            return

        result["eid"] = eid_val
        result["name"] = name_val
        root.destroy()

    def on_cancel():
        root.destroy()

    btn_frame = ttk.Frame(main_frame)
    btn_frame.grid(row=3, column=0, columnspan=2, pady=(20, 0))

    submit_btn = ttk.Button(btn_frame, text="📷 Start Camera", command=on_submit)
    submit_btn.pack(side="left", padx=5)

    cancel_btn = ttk.Button(btn_frame, text="Cancel", command=on_cancel)
    cancel_btn.pack(side="left", padx=5)

    root.bind("<Return>", lambda e: on_submit())
    root.bind("<Escape>", lambda e: on_cancel())
    root.protocol("WM_DELETE_WINDOW", on_cancel)

    root.mainloop()
    return result["eid"], result["name"]


def _draw_guide(frame: np.ndarray) -> np.ndarray:
    """Draw a centred face-guide rectangle and instructions on frame."""
    h, w = frame.shape[:2]
    cx, cy = w // 2, h // 2
    bw, bh = int(w * 0.35), int(h * 0.60)
    x1, y1 = cx - bw // 2, cy - bh // 2
    x2, y2 = cx + bw // 2, cy + bh // 2

    overlay = frame.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 255, 0), 2)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    cv2.putText(
        frame,
        "Align your face inside the box",
        (20, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        "SPACE = Capture Photo  |  Q = Quit",
        (20, 60),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Capture your face and register an embedding."
    )
    parser.add_argument("--eid", help="Your enrollment / student ID")
    parser.add_argument("--name", help="Your display name")
    parser.add_argument("--camera", type=int, default=0, help="Camera device index")
    parser.add_argument(
        "--photos",
        type=int,
        default=5,
        help="Number of photos to capture for average embedding",
    )
    args = parser.parse_args()

    eid = args.eid
    name = args.name

    if not eid or not name:
        eid, name = gui_prompt_credentials()

    if not eid or not name:
        print("Registration cancelled.")
        return

    eid = eid.strip()
    name = name.strip()

    print(f"Starting face capture for: {name} (EID: {eid})")
    print("Loading InsightFace model ...")
    app = FaceAnalysis(
        name="buffalo_l",
        root=_insightface_root(),
        providers=["CPUExecutionProvider"],
    )
    app.prepare(ctx_id=-1, det_size=(640, 640))
    print("Model ready.\n")

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Camera Error", f"Cannot open camera index {args.camera}.")
        root.destroy()
        sys.exit(1)

    student_dir = STUDENT_DIR / eid
    student_dir.mkdir(parents=True, exist_ok=True)

    captured_count = 0
    total_needed = args.photos
    embeddings_list: list[np.ndarray] = []

    print(f"Capturing {total_needed} photo(s). Press SPACE to capture, Q to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Warning: Could not read frame from camera.")
            break

        display = _draw_guide(frame.copy())

        cv2.putText(
            display,
            f"Captured: {captured_count}/{total_needed}",
            (20, display.shape[0] - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )

        cv2.imshow("SAMS — Capture Face", display)
        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            print("Cancelled — no photos saved.")
            cap.release()
            cv2.destroyAllWindows()
            return

        if key == ord(" "):
            faces = app.get(frame)
            if not faces:
                print("⚠ No face detected — try again.")
                continue

            face = max(
                faces,
                key=lambda f: (
                    (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
                ),
            )

            captured_count += 1
            photo_path = student_dir / f"{eid}_{captured_count}.jpg"
            cv2.imwrite(str(photo_path), frame)
            embeddings_list.append(face.embedding)
            print(
                f"  ✓ Photo {captured_count}/{total_needed} saved -> {photo_path.name}"
            )

            if captured_count >= total_needed:
                break

    cap.release()
    cv2.destroyAllWindows()

    if not embeddings_list:
        print("No photos captured.")
        return

    name_file = student_dir / "name.txt"
    name_file.write_text(name, encoding="utf-8")

    avg_emb = np.mean(embeddings_list, axis=0)
    norm = np.linalg.norm(avg_emb)
    if norm > 0:
        avg_emb /= norm

    EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
    emb_path = EMBEDDINGS_DIR / "student_embeddings.npy"

    existing: dict[str, np.ndarray] = {}
    if emb_path.is_file():
        try:
            existing = np.load(emb_path, allow_pickle=True).item()
        except Exception:
            pass

    existing[eid] = avg_emb
    np.save(emb_path, existing, allow_pickle=True)

    attendance_db.init_db()
    attendance_db.upsert_student(eid, name)

    print(f"\n✅ Successfully registered {name} ({eid})!")

    root = tk.Tk()
    root.withdraw()
    messagebox.showinfo(
        "Enrollment Complete",
        f"✅ Success!\n\nRegistered: {name}\nEID: {eid}\nPhotos Saved: {total_needed}\nEmbedding Database Updated!",
    )
    root.destroy()


if __name__ == "__main__":
    main()
