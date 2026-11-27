const imageTypes: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp"
};

function imageType(file: File) {
  return file.type.startsWith("image/") ? file.type : imageTypes[file.name.split(".").pop()?.toLowerCase() ?? ""];
}

export function imageFiles(files: FileList | null | undefined) {
  return Array.from(files ?? []).filter(imageType);
}

export async function loadSketchImage(file: File) {
  const type = imageType(file);
  if (!type || file.size > 20 * 1024 * 1024) throw new Error("Choose an image file up to 20 MB.");
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read the image."));
    reader.readAsDataURL(file.type === type ? file : file.slice(0, file.size, type));
  });
  // Keep the original SVG in an image context, where scripts and external resources are disabled.
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    throw new Error("Couldn't open this image. Try a PNG, JPEG, WebP, or SVG.");
  }
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("This image has no visible size.");
  return { src, w: image.naturalWidth, h: image.naturalHeight, name: file.name || "Pasted image" };
}
