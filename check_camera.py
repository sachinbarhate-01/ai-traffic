
import cv2

for index in range(5):
    cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)

    if cap.isOpened():
        ok, frame = cap.read()
        print(f"Camera {index}: opened, frame_read={ok}")

        if ok:
            cv2.imshow(f"Camera {index} - Press any key", frame)
            cv2.waitKey(0)

        cap.release()
        cv2.destroyAllWindows()
    else:
        print(f"Camera {index}: unavailable")

cv2.destroyAllWindows()
