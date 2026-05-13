
/**
 * Aplica un filtro de nitidez (sharpening) y aumenta la resolución 2x usando Canvas.
 */
export async function enhanceMangaImage(base64Url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("No se pudo obtener el contexto de canvas");

      // Limitamos el escalado para no superar límites del navegador (ej. 4096px)
      const MAX_DIMENSION = 4096;
      let scale = 1;
      
      if (img.width < 1500 || img.height < 1500) {
        scale = 2;
      }
      
      // Aseguramos que no exceda el máximo
      if (img.width * scale > MAX_DIMENSION) scale = MAX_DIMENSION / img.width;
      if (img.height * scale > MAX_DIMENSION) scale = Math.min(scale, MAX_DIMENSION / img.height);
      
      // Si la escala es cercana a 1, no escalamos
      if (scale < 1.1) scale = 1;

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      // Dibujamos con suavizado para el upscale inicial
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Aplicamos un filtro de nitidez (Sharpening kernel)
      // Matriz:
      //  0 -1  0
      // -1  5 -1
      //  0 -1  0
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const originalData = new Uint8ClampedArray(data);
      
      const width = canvas.width;
      const height = canvas.height;
      const kernel = [
        0, -1,  0,
       -1,  5, -1,
        0, -1,  0
      ];

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          for (let c = 0; c < 3; c++) { // R, G, B
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                sum += originalData[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
              }
            }
            const targetIdx = (y * width + x) * 4 + c;
            data[targetIdx] = Math.min(255, Math.max(0, sum));
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = base64Url;
  });
}
