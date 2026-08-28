"""
live_verify.py — Real-time webcam verification of your identity using face embeddings.

Optimized for GPU speed + detection of partially obstructed faces (masks, glasses, side profiles).

Usage:
    python live_verify.py                (launches GUI selector)
    python live_verify.py --eid joy      (CLI mode)
"""

import argparse
import os
import sys
import tkinter as tk
from tkinter import messagebox, ttk
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis

# Robust project root detection
_CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = _CURRENT_DIR if (_CURRENT_DIR / "src").is_dir() else _CURRENT_DIR.parent

EMBEDDINGS_PATH = PROJECT_DIR / "embeddings" / "student_embeddings.npy"

SRC_DIR = PROJECT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import attendance_db


def _insightface_root() -> str:
    root = os.path.expanduser("~/.insightface")
    try:
        os.makedirs(root, exist_ok=True)
        probe = Path(root) / ".write_test"
        probe.touch()
        probe.unlink()
        return root
    except (OSError, PermissionError):
        return str(PROJECT_DIR / ".insightface")


def gui_select_target(
    student_map: dict[str, str]
) -> tuple[str | None, bool] | tuple[None, None]:
    """Launch GUI dialog to select target person and options."""
    root = tk.Tk()
    root.title("SAMS — Live Identity Verification")
    root.geometry("420x260")
    root.resizable(False, False)

    root.update_idletasks()
    width = root.winfo_width()
    height = root.winfo_height()
    x = (root.winfo_screenwidth() // 2) - (width // 2)
    y = (root.winfo_screenheight() // 2) - (height // 2)
    root.geometry(f"{width}x{height}+{x}+{y}")

    style = ttk.Style()
    style.theme_use("clam")

    main_frame = ttk.Frame(root, padding=20)
    main_frame.pack(fill="both", expand=True)

    ttk.Label(
        main_frame, text="Live Verification Setup", font=("Helvetica", 14, "bold")
    ).grid(row=0, column=0, columnspan=2, pady=(0, 15), sticky="w")

    options = ["ALL — Verify Any Enrolled Student"]
    eid_keys = list(student_map.keys())
    for eid, name in student_map.items():
        options.append(f"{name} ({eid})")

    ttk.Label(main_frame, text="Select Person:", font=("Helvetica", 10)).grid(
        row=1, column=0, sticky="w", pady=5
    )
    combo = ttk.Combobox(
        main_frame, values=options, state="readonly", width=30
    )
    combo.current(0)
    combo.grid(row=1, column=1, sticky="e", pady=5)

    mark_var = tk.BooleanVar(value=True)
    mark_chk = ttk.Checkbutton(
        main_frame,
        text="Automatically record attendance in database",
        variable=mark_var,
    )
    mark_chk.grid(row=2, column=0, columnspan=2, sticky="w", pady=(15, 10))

    selection = {"eid": None, "mark": False, "cancelled": True}

    def on_start():
        idx = combo.current()
        if idx == 0:
            selection["eid"] = None
        else:
            selection["eid"] = eid_keys[idx - 1]
        selection["mark"] = mark_var.get()
        selection["cancelled"] = False
        root.destroy()

    def on_cancel():
        root.destroy()

    btn_frame = ttk.Frame(main_frame)
    btn_frame.grid(row=3, column=0, columnspan=2, pady=(15, 0))

    start_btn = ttk.Button(
        btn_frame, text="📷 Start Verification", command=on_start
    )
    start_btn.pack(side="left", padx=5)

    cancel_btn = ttk.Button(btn_frame, text="Cancel", command=on_cancel)
    cancel_btn.pack(side="left", padx=5)

    root.bind("<Return>", lambda e: on_start())
    root.bind("<Escape>", lambda e: on_cancel())
    root.protocol("WM_DELETE_WINDOW", on_cancel)

    root.mainloop()

    if selection["cancelled"]:
        return None, None

    return selection["eid"], selection["mark"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify identity in real-time using webcam."
    )
    parser.add_argument(
        "--eid",
        type=str,
        default=None,
        help="Target Enrollment ID to verify (e.g. joy)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.42,
        help="High confidence similarity threshold (default: 0.42)",
    )
    parser.add_argument(
        "--partial-threshold",
        type=float,
        default=0.34,
        help="Partial obstruction threshold for masks/glasses/angles (default: 0.34)",
    )
    parser.add_argument(
        "--det-thresh",
        type=float,
        default=0.35,
        help="Detection confidence threshold to detect partially covered faces (default: 0.35)",
    )
    parser.add_argument(
        "--camera", type=int, default=0, help="Camera device index"
    )
    parser.add_argument(
        "--mark",
        action="store_true",
        help="Automatically mark attendance in DB when verified",
    )
    parser.add_argument(
        "--det-size",
        type=int,
        default=384,
        help="Face detection model resolution (default: 384 for fast + obstructed recall)",
    )
    parser.add_argument(
        "--frame-skip",
        type=int,
        default=2,
        help="Process detection every N frames (default: 2)",
    )
    args = parser.parse_args()

    if not EMBEDDINGS_PATH.is_file():
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            "Error",
            f"No embeddings database found.\nPlease run `python capture_face.py` first to register!",
        )
        root.destroy()
        sys.exit(1)

    all_embeddings: dict[str, np.ndarray] = np.load(
        EMBEDDINGS_PATH, allow_pickle=True
    ).item()
    if not all_embeddings:
        sys.exit("Error: Embeddings database is empty.")

    attendance_db.init_db()
    student_names = attendance_db.get_all_students()

    target_eid = args.eid
    mark_attendance_flag = args.mark

    if target_eid is None and len(sys.argv) == 1:
        target_eid, mark_attendance_flag = gui_select_target(student_names)
        if target_eid is None and mark_attendance_flag is None:
            print("Verification cancelled.")
            return

    target_name = (
        student_names.get(target_eid, target_eid) if target_eid else None
    )

    print("Loading InsightFace model (GPU enabled + Obstructed Face Detection) ...")
    app = FaceAnalysis(
        name="buffalo_l",
        root=_insightface_root(),
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    det_size = (args.det_size, args.det_size)

    # det_thresh=0.35 increases detection sensitivity for partially covered faces
    app.prepare(ctx_id=0, det_size=det_size, det_thresh=args.det_thresh)
    print(f"Model ready. Detection size: {det_size}, Detection threshold: {args.det_thresh}")

    if target_eid:
        print(f"🔍 Verifying target: {target_name} ({target_eid})")
    else:
        print("🔍 Verifying: Any enrolled student")

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Camera Error", f"Cannot open camera index {args.camera}.")
        root.destroy()
        sys.exit(1)

    print("Press 'Q' on the video window to exit.\n")
    marked_eids = set()

    frame_count = 0
    cached_face_results = []

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Warning: Failed to grab frame.")
            break

        frame_count += 1

        if frame_count % max(1, args.frame_skip) == 0 or not cached_face_results:
            scale = 0.65
            small_frame = cv2.resize(frame, (0, 0), fx=scale, fy=scale)

            faces = app.get(small_frame)
            current_results = []

            for face in faces:
                bbox = (face.bbox / scale).astype(int)

                query_emb = face.embedding
                norm = np.linalg.norm(query_emb)
                if norm > 0:
                    query_emb /= norm

                best_eid = None
                best_sim = -1.0

                search_space = (
                    {target_eid: all_embeddings[target_eid]}
                    if target_eid and target_eid in all_embeddings
                    else all_embeddings
                )

                for eid, known_emb in search_space.items():
                    sim = float(np.dot(query_emb, known_emb))
                    if sim > best_sim:
                        best_sim = sim
                        best_eid = eid

                if best_eid is not None and best_sim >= args.threshold:
                    name = student_names.get(best_eid, best_eid)
                    label = f"MATCH: {name} ({best_sim:.2f})"
                    color = (0, 255, 0)
                    should_mark = True
                elif best_eid is not None and best_sim >= args.partial_threshold:
                    name = student_names.get(best_eid, best_eid)
                    label = f"PARTIAL: {name} ({best_sim:.2f})"
                    color = (0, 255, 255)
                    should_mark = True
                else:
                    label = f"UNKNOWN ({best_sim:.2f})" if best_sim > 0 else "UNKNOWN"
                    color = (0, 0, 255)
                    should_mark = False

                if should_mark and mark_attendance_flag and best_eid not in marked_eids:
                    now = datetime.now()
                    inserted = attendance_db.mark_attendance(
                        best_eid, student_names.get(best_eid, best_eid), now
                    )
                    if inserted:
                        print(
                            f"  [ATTENDANCE MARKED] {student_names.get(best_eid, best_eid)} ({best_eid}) at {now.strftime('%H:%M:%S')}"
                        )
                    marked_eids.add(best_eid)

                current_results.append((bbox, label, color))

            cached_face_results = current_results

        for bbox, label, color in cached_face_results:
            x1, y1, x2, y2 = bbox

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.6
            thickness = 2
            (text_w, text_h), baseline = cv2.getTextSize(
                label, font, font_scale, thickness
            )

            text_y = y1 - 10 if y1 - text_h - 10 > 0 else y1 + text_h + 10
            cv2.rectangle(
                frame,
                (x1, text_y - text_h - 5),
                (x1 + text_w + 10, text_y + 5),
                color,
                -1,
            )
            cv2.putText(
                frame,
                label,
                (x1 + 5, text_y),
                font,
                font_scale,
                (0, 0, 0) if color == (0, 255, 255) else (255, 255, 255),
                thickness,
                cv2.LINE_AA,
            )

        status_line = (
            f"Target: {target_name} ({target_eid})"
            if target_eid
            else "Mode: All Enrolled Students"
        )
        cv2.putText(
            frame,
            f"{status_line} | Press Q to Quit",
            (10, 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

        cv2.imshow("SAMS — Live Identity Verification", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("Verification ended.")


if __name__ == "__main__":
    main()
