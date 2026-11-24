'use strict';

(() => {
  const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

  // ------------------------------------------------------------------------
  // メニュー（タブレット・SPで右カラムをドロワーとして開閉）
  // ------------------------------------------------------------------------
  const initMenu = () => {
    const menuButton = document.querySelector('.js-menu-button');
    const nav = document.getElementById('side-nav');
    if (!menuButton || !nav) return;

    const closeButton = nav.querySelector('.js-menu-close');
    const drawerQuery = window.matchMedia('(max-width: 1099px)');

    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('is-menu-open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    };

    menuButton.addEventListener('click', () => {
      setOpen(true);
      closeButton?.focus();
    });

    closeButton?.addEventListener('click', () => {
      setOpen(false);
      menuButton.focus();
    });

    // ドロワー内のリンクを押したら閉じる
    nav.addEventListener('click', (event) => {
      if (drawerQuery.matches && event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        menuButton.focus();
      }
    });

    // PC幅に戻ったら開閉状態をリセット
    drawerQuery.addEventListener('change', (event) => {
      if (!event.matches) setOpen(false);
    });
  };

  // ------------------------------------------------------------------------
  // FAQ アコーディオン（複数同時に開閉可）
  // ------------------------------------------------------------------------
  const initFaq = () => {
    document.querySelectorAll('.js-faq-button').forEach((button) => {
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      if (!panel) return;

      button.addEventListener('click', () => {
        const open = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(open));
        panel.classList.toggle('is-open', open);
      });
    });
  };

  // ------------------------------------------------------------------------
  // .worries-card / .choose-card 左右フェードイン（IntersectionObserver）
  // ------------------------------------------------------------------------
  const initFadeInCards = () => {
    const cards = document.querySelectorAll('.worries-card, .choose-card__item');
    if (!cards.length) return;

    if (!('IntersectionObserver' in window)) {
      cards.forEach((card) => card.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.3 });

    cards.forEach((card) => observer.observe(card));
  };

  // ------------------------------------------------------------------------
  // Scroll-driven Card Stack の代替実装
  // CSS の animation-timeline 非対応ブラウザでのみ、同じ縮小計算を JS で行う
  // （カードの sticky による重なり自体は CSS のみで動作）
  // ------------------------------------------------------------------------
  const initCardStackFallback = () => {
    if (window.CSS && CSS.supports('animation-timeline: view()')) return;

    const pageStacks = [...document.querySelectorAll('.traial-card, .flow-card')];
    const boxStacks = [...document.querySelectorAll('.worries-img')];
    if (!pageStacks.length && !boxStacks.length) return;

    const scaleItems = (items, step, progressOf) => {
      const n = items.length;
      items.forEach((item, i) => {
        const progress = progressOf(i, n);
        item.style.transform = `scale(${1 - step * (n - 1 - i) * progress})`;
      });
    };

    const readStep = (el) => parseFloat(getComputedStyle(el).getPropertyValue('--stack-step')) || 0.05;

    // ページスクロール連動（exit-crossing 相当）
    const updatePageStack = (list) => {
      const style = getComputedStyle(list);
      const stackTop = parseFloat(style.getPropertyValue('--stack-top')) || 0;
      const rect = list.getBoundingClientRect();
      const progress = clamp((stackTop - rect.top) / rect.height);
      scaleItems([...list.children], readStep(list), (i, n) => clamp((progress - i / n) * n));
    };

    // 350×350 の枠内スタック（.worries-img）：.worries__pin の固定区間の進行に連動（CSS と同じ区間設定）
    const updateBoxStack = (box) => {
      const pin = box.closest('.worries__pin');
      if (!pin) return;
      const style = getComputedStyle(box);
      const gap = parseFloat(style.getPropertyValue('--stack-gap')) || 0;
      const hold = parseFloat(style.getPropertyValue('--stack-hold')) || 0;
      const distance = parseFloat(getComputedStyle(pin, '::before').height) || 0;
      const pinBottom = pin.getBoundingClientRect().bottom;
      const progress = distance > 0 ? clamp((window.innerHeight + distance - pinBottom) / distance) : 1;
      const items = [...box.children];
      const seg = 1 / (items.length - 1);
      const local = (start, end) => clamp((progress - start) / (end - start));
      items.forEach((item, i) => {
        const arrived = i === 0 ? 1 : local((i - 1) * seg + hold, i * seg - hold);
        item.style.translate = `0 ${(1 - arrived) * (box.clientHeight + gap)}px`;
      });
      scaleItems(items, readStep(box), (i) => local(i * seg + hold, (i + 1) * seg - hold));
    };

    let ticking = false;
    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        pageStacks.forEach(updatePageStack);
        boxStacks.forEach(updateBoxStack);
        ticking = false;
      });
    };

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    requestUpdate();
  };

  // ------------------------------------------------------------------------
  // .add__slider 左右矢印（スクロール・スワイプ操作はそのまま維持）
  // ------------------------------------------------------------------------
  const initSlider = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('.js-slider').forEach((slider) => {
      const wrap = slider.parentElement;
      const prev = wrap.querySelector('.js-slider-prev');
      const next = wrap.querySelector('.js-slider-next');
      const count = slider.children.length;
      if (!prev || !next || !count) return;

      const step = () => slider.firstElementChild.getBoundingClientRect().width + (parseFloat(getComputedStyle(slider).columnGap) || 0);
      const current = () => Math.round(slider.scrollLeft / step());
      const goTo = (index) => {
        slider.scrollTo({
          left: clamp(index, 0, count - 1) * step(),
          behavior: reduceMotion.matches ? 'auto' : 'smooth',
        });
      };

      // 端では押せないことを示す（フォーカスは保持するため disabled ではなく aria-disabled）
      const updateArrows = () => {
        const max = slider.scrollWidth - slider.clientWidth;
        prev.setAttribute('aria-disabled', String(slider.scrollLeft <= 1));
        next.setAttribute('aria-disabled', String(slider.scrollLeft >= max - 1));
      };

      prev.addEventListener('click', () => goTo(current() - 1));
      next.addEventListener('click', () => goTo(current() + 1));
      slider.addEventListener('scroll', updateArrows, { passive: true });
      window.addEventListener('resize', updateArrows);
      updateArrows();
    });
  };

  // ------------------------------------------------------------------------
  // 右カラム（メニュー）のページ内リンクをスムーススクロール
  // 中央カラムはページ全体（window）のスクロールで動くため、window をスクロールする
  // ※ reset の scroll-behavior は html:focus-within 時のみ有効で、リンクにフォーカスが
  //   移らないブラウザでは瞬時のジャンプになるため JS で制御する
  // ------------------------------------------------------------------------
  const initSmoothScroll = () => {
    const nav = document.getElementById('side-nav');
    if (!nav) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // initMenu の後に登録し、ドロワーを閉じてからスクロールさせる
    nav.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      const id = link?.getAttribute('href').slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;

      event.preventDefault();
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY,
        behavior: reduceMotion.matches ? 'auto' : 'smooth',
      });
      history.pushState(null, '', `#${id}`);
    });
  };

  initMenu();
  initSmoothScroll();
  initFaq();
  initFadeInCards();
  initCardStackFallback();
  initSlider();
})();
