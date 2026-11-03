// Static enhancement for article images. The article's HTML and original links
// remain untouched; if JavaScript or the native dialog API is unavailable,
// images continue to display as before.
export const imageViewerStyles = `
    .article .content img.image-viewer-trigger { cursor: zoom-in; }
    .article .content img.image-viewer-trigger:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    dialog.image-viewer { position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; border: 0; padding: 0; background: rgba(12, 10, 9, .96); color: #fafaf9; }
    dialog.image-viewer::backdrop { background: rgba(12, 10, 9, .8); }
    .image-viewer-bar { height: 3.75rem; display: flex; align-items: center; justify-content: flex-end; gap: .5rem; padding: .5rem max(1rem, env(safe-area-inset-right)); }
    .image-viewer-bar button { min-height: 2.5rem; padding: .4rem .8rem; border: 1px solid #78716c; border-radius: 6px; background: #292524; color: #fff; font: 500 .875rem var(--font-sans); cursor: pointer; }
    .image-viewer-bar button:hover { background: #44403c; }
    .image-viewer-bar button:focus-visible { outline: 3px solid #fb923c; outline-offset: 2px; }
    .image-viewer-stage { height: calc(100% - 3.75rem); overflow: auto; display: flex; padding: 1rem; }
    .image-viewer-stage img { display: block; margin: auto; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
    .image-viewer-stage.is-original img { max-width: none; max-height: none; object-fit: initial; }
`;

export const imageViewerScript = `
    (function () {
      var article = document.querySelector('.article .content');
      if (!article || typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
      var images = Array.prototype.filter.call(article.querySelectorAll('img'), function (img) {
        return !img.closest('a, button') && !!(img.currentSrc || img.getAttribute('src') || img.getAttribute('srcset'));
      });
      if (!images.length) return;

      var dialog = document.createElement('dialog');
      dialog.className = 'image-viewer';
      dialog.setAttribute('aria-label', '图片预览');
      var bar = document.createElement('div');
      bar.className = 'image-viewer-bar';
      var sizeButton = document.createElement('button');
      sizeButton.type = 'button';
      sizeButton.textContent = '原始尺寸';
      sizeButton.setAttribute('aria-pressed', 'false');
      var closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = '关闭';
      closeButton.setAttribute('aria-label', '关闭图片预览');
      var stage = document.createElement('div');
      stage.className = 'image-viewer-stage';
      var preview = document.createElement('img');
      stage.appendChild(preview);
      bar.appendChild(sizeButton);
      bar.appendChild(closeButton);
      dialog.appendChild(bar);
      dialog.appendChild(stage);
      document.body.appendChild(dialog);

      var trigger = null;
      function open(img) {
        var source = img.currentSrc || img.src;
        if (!source) return;
        trigger = img;
        preview.src = source;
        preview.alt = img.alt || '';
        dialog.showModal();
        closeButton.focus();
      }
      images.forEach(function (img) {
        img.classList.add('image-viewer-trigger');
        img.setAttribute('tabindex', '0');
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', img.alt ? '放大图片：' + img.alt : '放大图片');
        img.addEventListener('click', function () { open(img); });
        img.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(img); }
        });
      });
      closeButton.addEventListener('click', function () { dialog.close(); });
      sizeButton.addEventListener('click', function () {
        var isOriginal = stage.classList.toggle('is-original');
        sizeButton.textContent = isOriginal ? '适应屏幕' : '原始尺寸';
        sizeButton.setAttribute('aria-pressed', isOriginal ? 'true' : 'false');
      });
      stage.addEventListener('click', function (event) { if (event.target === stage) dialog.close(); });
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', function () {
        stage.classList.remove('is-original');
        sizeButton.textContent = '原始尺寸';
        sizeButton.setAttribute('aria-pressed', 'false');
        preview.removeAttribute('src');
        if (trigger) trigger.focus();
        trigger = null;
      });
    })();
`;
