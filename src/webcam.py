import cv2
import numpy as np
from insightface.app import FaceAnalysis


known_embeddings = np.load(
    "embeddings/student_embeddings.npy",
    allow_pickle=True
).item()


app = FaceAnalysis(
    name="buffalo_l"
)

app.prepare(
    ctx_id=0,
    det_size=(640, 640)
)


cap = cv2.VideoCapture(0)


while True:

    ret, frame = cap.read()


    if not ret:

        break


    faces = app.get(frame)


    for face in faces:

        embedding = face.embedding

        embedding = (
            embedding /
            np.linalg.norm(embedding)
        )


        best_score = -1
        best_match = None


        for student_id, known_embedding in known_embeddings.items():

            similarity = np.dot(
                embedding,
                known_embedding
            )


            if similarity > best_score:

                best_score = similarity
                best_match = student_id


        THRESHOLD = 0.45


        if best_score >= THRESHOLD:

            label = best_match

        else:

            label = "Unknown"


        bbox = face.bbox.astype(int)

        x1, y1, x2, y2 = bbox


        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            2
        )


        cv2.putText(
            frame,
            f"{label} {best_score:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )


    cv2.imshow(
        "SAMS Face Recognition",
        frame
    )


    key = cv2.waitKey(1)


    if key == ord("q"):

        break


cap.release()

cv2.destroyAllWindows()