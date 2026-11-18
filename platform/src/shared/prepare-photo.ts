export async function preparePhoto(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 15 * 1024 * 1024
  )
    throw new Error('请选择 15 MB 以内的 JPG、PNG 或 WebP 照片。');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('浏览器无法处理照片。');
    drawing.fillStyle = '#fff';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.65, 0.45]) {
      const photo = canvas.toDataURL('image/jpeg', quality);
      if (photo.length <= 950000) return photo;
    }
    throw new Error('照片压缩后仍过大，请裁剪至当前小题。');
  } finally {
    bitmap.close();
  }
}
