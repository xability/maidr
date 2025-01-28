export const convertSVGtoBase64 = async (
  svg: HTMLElement | null
): Promise<string> => {
  try {
    if (!svg) {
      throw new Error('Invalid SVG element: null or undefined');
    }

    // Serialize the SVG element to a string
    const svgString = new XMLSerializer().serializeToString(svg);

    // Minify the SVG by removing unnecessary whitespace and line breaks
    const minifiedSvg = svgString
      .replace(/\r?\n|\r/g, '') // Remove line breaks
      .replace(/\t/g, '') // Remove tabs
      .replace(/>\s+</g, '><') // Remove spaces between tags
      .trim(); // Trim leading and trailing spaces

    // Create a Blob from the minified SVG
    const svgBlob = new Blob([minifiedSvg], {type: 'image/svg+xml'});

    // Create an Image element
    const img = new Image();
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onload = () => {
        img.onload = () => {
          // Create a canvas element
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw the SVG image onto the canvas
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);

            // Convert the canvas to a JPEG data URL
            const jpegDataUrl = canvas.toDataURL('image/jpeg');

            // Extract the Base64 part of the data URL
            const base64 = jpegDataUrl.split(',')[1];

            // Return the Base64 encoded data URI
            resolve(`data:image/jpeg;base64,${base64}`);
          } else {
            reject(new Error('Failed to get canvas context'));
          }
        };

        img.onerror = error => {
          reject(new Error('Error loading SVG image'));
        };

        // Set the image source to the FileReader result
        img.src = reader.result as string;
      };

      reader.onerror = error => {
        reject(new Error('Error reading SVG Blob'));
      };

      // Read the Blob as a data URL
      reader.readAsDataURL(svgBlob);
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error converting SVG to Base64:', error.message);
    } else {
      console.error('Error converting SVG to Base64:', error);
    }
    return '';
  }
};
