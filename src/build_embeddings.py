import os
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis

import attendance_db

PROJECT_DIR = Path(__file__).resolve().parent.parent
STUDENT_DIR = PROJECT_DIR / "data" / "students"
OUTPUT_PATH = PROJECT_DIR / "embeddings" / "student_embeddings.npy"

# Folder name = EID (e.g. data/students/CS21-045/). Each folder should also
# contain a name.txt with the student's display name on the first line;
# without one, the folder name is used as the name too.
NAME_FILE = "name.txt"


def read_student_name(student_path: Path) -> str:
    name_file = student_path / NAME_FILE
    if name_file.is_file():
        first_line = name_file.read_text(encoding="utf-8").strip().splitlines()
        if first_line:
            cleaned = attendance_db.clean_name(first_line[0])
            if cleaned:
                return cleaned
    return student_path.name


def main() -> None:
    if not STUDENT_DIR.is_dir():
        STUDENT_DIR.mkdir(parents=True)
        print(
            f"Student directory created: {STUDENT_DIR}\n"
            f"Add images under data/students/<EID>/ (plus an optional {NAME_FILE} "
            "with the student's name) and run again."
        )
        return

    student_dirs = [d for d in STUDENT_DIR.iterdir() if d.is_dir()]
    if not student_dirs:
        print(f"No student subdirectories found in {STUDENT_DIR}. Please add student folders containing their images.")
        return

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

    attendance_db.init_db()
    student_embeddings = {}

    for student_path in sorted(STUDENT_DIR.iterdir()):
        if not student_path.is_dir():
            continue

        eid = attendance_db.clean_eid(student_path.name)
        if eid is None:
            print(f"Skipping folder with invalid EID: {student_path.name!r} (letters, numbers, - or _ only)")
            continue

        embeddings = []
        for image_path in sorted(student_path.iterdir()):
            if not image_path.is_file() or image_path.name == NAME_FILE:
                continue

            image = cv2.imread(str(image_path))
            if image is None:
                print(f"Could not read image: {image_path}")
                continue

            faces = app.get(image)
            if not faces:
                print(f"No face found in {image_path}")
                continue

            face = max(
                faces,
                key=lambda current_face: (
                    (current_face.bbox[2] - current_face.bbox[0])
                    * (current_face.bbox[3] - current_face.bbox[1])
                ),
            )
            embeddings.append(face.embedding)

        if not embeddings:
            continue

        average_embedding = np.mean(embeddings, axis=0)
        norm = np.linalg.norm(average_embedding)
        if norm == 0:
            print(f"Could not normalize embedding: {student_path.name}")
            continue

        name = read_student_name(student_path)
        student_embeddings[eid] = average_embedding / norm
        attendance_db.upsert_student(eid, name)
        print(f"Embedding created: {name} ({eid})")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.save(OUTPUT_PATH, student_embeddings, allow_pickle=True)
    print(f"Embedding database created successfully: {OUTPUT_PATH}")
    print(f"Student names/EIDs saved to: {attendance_db.DB_PATH}")


if __name__ == "__main__":
    main()