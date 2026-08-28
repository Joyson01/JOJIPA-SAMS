import argparse
import os
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis

import attendance_db

PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_IMAGE_PATH = PROJECT_DIR / "src" / "Test" / "test_group.jpg"
DEFAULT_IMAGE_PATH = PROJECT_DIR / "src" / "Test" / "test_grp.jpg"
EMBEDDINGS_PATH = PROJECT_DIR / "embeddings" / "student_embeddings.npy"


def main() -> None:
    parser = argparse.ArgumentParser(description="Detect and recognize faces in an image")
    parser.add_argument(
        "image",
        type=Path,
        nargs="?",
        default=DEFAULT_IMAGE_PATH,
        help="Path to the image to analyze (default: src/Test/Tested.jpg)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Path to save the annotated image (default: alongside the input image)",
    )
    args = parser.parse_args()

    image_path = args.image.expanduser().resolve()
    if not image_path.is_file():
        raise SystemExit(f"Error: Image file does not exist: {image_path}")

    image = cv2.imread(str(image_path))
    if image is None:
        raise SystemExit(f"Error: Could not load image: {image_path}")

    # Determine a writeable InsightFace root directory
    insightface_root = os.path.expanduser("~/.insightface")
    try:
        os.makedirs(insightface_root, exist_ok=True)
        test_file = Path(insightface_root) / ".write_test"
        test_file.touch()
        test_file.unlink()
    except (OSError, PermissionError):
        insightface_root = str(PROJECT_DIR / ".insightface")
        print(f"Default home directory read-only; falling back to local root: {insightface_root}")

    app = FaceAnalysis(
        name="buffalo_l",
        root=insightface_root,
        providers=["CPUExecutionProvider"],
    )
    app.prepare(
        ctx_id=-1,
        det_size=(640, 640),
    )

    # Load student embeddings (keyed by EID) and the EID -> name lookup
    student_embeddings = {}
    if EMBEDDINGS_PATH.is_file():
        try:
            student_embeddings = np.load(EMBEDDINGS_PATH, allow_pickle=True).item()
            print(f"Loaded {len(student_embeddings)} student embeddings from database.")
        except Exception as e:
            print(f"Warning: Could not load embeddings database: {e}")
    else:
        print("Warning: No embeddings database found. Faces will be labeled as 'Unknown'.")

    attendance_db.init_db()
    student_names = attendance_db.get_all_students()

    faces = app.get(image)
    print(f"Faces detected: {len(faces)}")

    for face in faces:
        x1, y1, x2, y2 = face.bbox.astype(int)

        # Draw bounding box
        cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 0), 2)

        # Recognize face if database is loaded
        label = "Unknown"
        if student_embeddings and face.embedding is not None:
            query_emb = face.embedding
            query_norm = np.linalg.norm(query_emb)
            if query_norm > 0:
                query_emb = query_emb / query_norm

            best_eid = None
            best_sim = -1.0
            for eid, emb in student_embeddings.items():
                sim = float(np.dot(query_emb, emb))
                if sim > best_sim:
                    best_sim = sim
                    best_eid = eid

            # 0.4 similarity threshold for InsightFace buffalo_l
            threshold = 0.4
            if best_eid is not None and best_sim >= threshold:
                best_name = student_names.get(best_eid, best_eid)
                label = f"{best_name} ({best_sim:.2f})"

        # Draw text label and background
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        thickness = 1
        text_size, _ = cv2.getTextSize(label, font, font_scale, thickness)
        text_w, text_h = text_size

        # Determine y coordinate to prevent label going out of bounds
        text_y = y1 - 10 if y1 - text_h - 10 > 0 else y1 + text_h + 10

        cv2.rectangle(
            image,
            (x1, text_y - text_h - 5),
            (x1 + text_w + 10, text_y + 5),
            (0, 255, 0),
            -1,
        )
        cv2.putText(
            image,
            label,
            (x1 + 5, text_y),
            font,
            font_scale,
            (0, 0, 0),
            thickness,
            cv2.LINE_AA,
        )

    # Save output image
    output_path = args.output
    if output_path is None:
        output_path = image_path.parent / f"{image_path.stem}_detected{image_path.suffix}"
    
    cv2.imwrite(str(output_path), image)
    print(f"Annotated image saved to: {output_path}")

    # Check GUI display availability
    if "DISPLAY" in os.environ or os.name == "nt":
        try:
            cv2.imshow("Face Detection and Recognition", image)
            cv2.waitKey(0)
            cv2.destroyAllWindows()
        except cv2.error as e:
            print(f"Could not display GUI window: {e}")
    else:
        print("Headless environment detected. Skipping GUI display.")


if __name__ == "__main__":
    main()