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
  // .worries-card 左右フェードイン（IntersectionObserver）
  // ------------------------------------------------------------------------
  const initWorriesCards = () => {
    const cards = document.querySelectorAll('.worries-card');
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
    const innerStacks = [...document.querySelectorAll('.worries-img')];
    if (!pageStacks.length && !innerStacks.length) return;

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

    // 要素内スクロール連動
    const updateInnerStack = (scroller) => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      const progress = max > 0 ? scroller.scrollTop / max : 0;
      scaleItems([...scroller.children], readStep(scroller), (i, n) => clamp((progress - i / (n - 1)) * (n - 1)));
    };

    let ticking = false;
    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        pageStacks.forEach(updatePageStack);
        innerStacks.forEach(updateInnerStack);
        ticking = false;
      });
    };

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    innerStacks.forEach((scroller) => scroller.addEventListener('scroll', requestUpdate, { passive: true }));
    requestUpdate();
  };

  initMenu();
  initFaq();
  initWorriesCards();
  initCardStackFallback();
})();
