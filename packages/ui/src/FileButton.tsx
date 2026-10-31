import { FileTrigger } from "react-aria-components";
import { Button } from "./Button";

/** Opens the file picker, or the camera on phones when `camera` is set. */
export function FileButton({
  children,
  camera = false,
  onFile,
}: {
  children: string;
  camera?: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <FileTrigger
      acceptedFileTypes={["image/*"]}
      defaultCamera={camera ? "environment" : undefined}
      onSelect={(files) => {
        const file = files?.[0];
        if (file) onFile(file);
      }}
    >
      <Button>{children}</Button>
    </FileTrigger>
  );
}
