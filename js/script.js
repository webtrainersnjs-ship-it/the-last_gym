'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // --------------------------------------------------
  // SP メニュー（右カラムをドロワーとして開閉）
  // --------------------------------------------------
  const nav = document.getElementById('global-nav');
  const openButton = document.querySelector('.js-menu-open');
  const closeButton = document.querySelector('.js-menu-close');

  const setMenu = (isOpen) => {
    nav.classList.toggle('is-open', isOpen);
    openButton.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      // 表示状態が反映されてからフォーカスを移す
      requestAnimationFrame(() => closeButton.focus());
    }
  };

  if (nav && openButton && closeButton) {
    openButton.addEventListener('click', () => setMenu(true));
    closeButton.addEventListener('click', () => {
      setMenu(false);
      openButton.focus();
    });
    nav.querySelectorAll('.js-menu-link').forEach((link) => {
      link.addEventListener('click', () => setMenu(false));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        setMenu(false);
        openButton.focus();
      }
    });
  }

  // --------------------------------------------------
  // FAQ アコーディオン（複数同時に開閉可能）
  // --------------------------------------------------
  document.querySelectorAll('.js-faq-button').forEach((button) => {
    const answer = document.getElementById(button.getAttribute('aria-controls'));
    if (!answer) return;

    button.addEventListener('click', () => {
      const isOpen = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(isOpen));
      answer.classList.toggle('is-open', isOpen);
    });
  });

  // --------------------------------------------------
  // worries-animation：画面内に入ったら左右からフェードイン
  // --------------------------------------------------
  const worries = document.querySelector('.js-worries-animation');

  if (worries && !prefersReducedMotion.matches && 'IntersectionObserver' in window) {
    worries.classList.add('is-ready');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          worries.classList.add('is-active');
          observer.disconnect();
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(worries);
  }

  // --------------------------------------------------
  // 横スクロール表のスクロールバー
  // --------------------------------------------------
  document.querySelectorAll('.js-scroll-table').forEach((table) => {
    const scroller = table.querySelector('.js-scroll-table-scroller');
    const thumb = table.querySelector('.js-scroll-table-thumb');
    if (!scroller || !thumb) return;

    const update = () => {
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      const ratio = maxScroll > 0 ? scroller.scrollLeft / maxScroll : 0;
      const maxMove = thumb.parentElement.clientWidth - thumb.offsetWidth;
      thumb.style.transform = `translateX(${ratio * maxMove}px)`;
    };

    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  // --------------------------------------------------
  // レッスンメニューのスライダー（前へ / 次へ）
  // --------------------------------------------------
  document.querySelectorAll('.js-slider').forEach((slider) => {
    const track = slider.querySelector('.js-slider-track');
    const prev = slider.querySelector('.js-slider-prev');
    const next = slider.querySelector('.js-slider-next');
    if (!track || !prev || !next) return;

    const step = () => {
      const card = track.firstElementChild;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    };

    // 端まで来たら反対側の端へ戻る（ボタンは常に表示）
    const move = (direction) => {
      const maxScroll = track.scrollWidth - track.clientWidth;
      if (direction > 0 && track.scrollLeft >= maxScroll - 1) {
        track.scrollTo({ left: 0 });
      } else if (direction < 0 && track.scrollLeft <= 1) {
        track.scrollTo({ left: maxScroll });
      } else {
        track.scrollBy({ left: step() * direction });
      }
    };

    prev.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
  });
});
