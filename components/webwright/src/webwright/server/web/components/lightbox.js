export function openLightbox(src, alt = "截图预览") {
  const box = document.getElementById("lightbox");
  const image = document.getElementById("lightboxImage");
  image.src = src;
  image.alt = alt;
  box.hidden = false;
}

export function bindLightbox() {
  const box = document.getElementById("lightbox");
  document.getElementById("lightboxClose").addEventListener("click", () => {
    box.hidden = true;
  });
}
