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
    const supportsTimeline = window.CSS && CSS.supports('animation-timeline: view()');
    // PC の .worries セクション上部の固定は timeline-scope も必要（非対応なら JS で代替）
    const supportsScope = window.CSS && CSS.supports('timeline-scope: none');
    if (supportsTimeline && supportsScope) return;

    const pageStacks = supportsTimeline ? [] : [...document.querySelectorAll('.traial-card, .flow-card')];
    const boxStacks = [...document.querySelectorAll('.worries-img')];
    if (!pageStacks.length && !boxStacks.length) return;
    const tabletQuery = window.matchMedia('(max-width: 1099px)');

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

    // .worries__pin の固定区間の進行度（PC のセクション上部の固定に使用）
    const updateBoxStack = (box) => {
      const pin = box.closest('.worries__pin');
      if (!pin) return;
      const distance = parseFloat(getComputedStyle(pin, '::before').height) || 0;
      // 固定位置（--choice ブロックの bottom）：PC は画面中央、SP・タブレットは 0（画面下端）
      const offset = parseFloat(getComputedStyle(pin.querySelector('.worries__block--choice')).bottom) || 0;
      const progress = distance > 0 ? clamp((window.innerHeight - offset + distance - pin.getBoundingClientRect().bottom) / distance) : 1;

      // 画像の横スライド自体は initWorriesSlide（全ブラウザ共通）で描画

      // PC：固定中はセクション上部（見出し・吹き出し）もスクロール量と同じだけ下へずらして止めて見せる
      const section = box.closest('.worries');
      section?.querySelectorAll('.worries__title, .worries__cards').forEach((el) => {
        el.style.translate = tabletQuery.matches ? '' : `0 ${progress * distance}px`;
      });
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
  // スクロールしているのはドキュメント全体（html）。左右カラムは position: fixed のため
  // 中央だけが動いて見える。.lp 自体はスクロールコンテナではないので window をスクロールする。
  // ※ reset の scroll-behavior: smooth は html:focus-within のときだけ有効で、
  //   クリックでリンクにフォーカスが移らない場合は瞬時のジャンプになるため JS で制御する
  // ------------------------------------------------------------------------
  const initSmoothScroll = () => {
    const nav = document.getElementById('side-nav');
    if (!nav) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // initMenu の後に登録し、タブレット・SPのドロワーを閉じてからスクロールさせる
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

  // ------------------------------------------------------------------------
  // .worries-img 横スライド（スクロール量に連動）
  // 目標位置は CSS のキーフレームと同じ区間（0〜10% 静止 → 45% で2枚目 → 55% まで静止 → 90% で3枚目 → 100% まで静止）。
  // マウスホイールの1ノッチ（約100px）で画像が1フレームで大きく飛ぶのを防ぐため、
  // requestAnimationFrame で目標位置へ滑らかに追従させる（スクロールを止めると目標位置でぴったり止まる）。
  // ※ JS 無効時は CSS のスクロール連動アニメーションで動作
  // ------------------------------------------------------------------------
  const initWorriesSlide = () => {
    const box = document.querySelector('.worries-img');
    const pin = box?.closest('.worries__pin');
    if (!box || !pin) return;
    const block = pin.querySelector('.worries__block--choice');
    const items = [...box.children];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SMOOTH_TIME = 0.12; // 追従の速さ（秒）。小さいほど機敏、大きいほど滑らか

    box.classList.add('is-js-slide'); // CSS 側のスクロール連動アニメーションを止め、JS で描画

    // レイアウト値は毎フレーム読まず、読み込み時とリサイズ時にだけ取得
    let metrics;
    const measure = () => {
      metrics = {
        distance: parseFloat(getComputedStyle(pin, '::before').height) || 0,
        offset: parseFloat(getComputedStyle(block).bottom) || 0, // 固定位置（PC：画面中央、SP・タブレット：0）
        step: box.clientWidth + (parseFloat(getComputedStyle(box).getPropertyValue('--stack-gap')) || 0),
      };
    };

    // 現在のスクロール位置での目標（何枚目を表示しているか：0〜2）
    const target = () => {
      const { distance, offset } = metrics;
      const progress = distance > 0 ? clamp((window.innerHeight - offset + distance - pin.getBoundingClientRect().bottom) / distance) : 1;
      return clamp((progress - 0.1) / 0.35) + clamp((progress - 0.55) / 0.35);
    };

    let current = null;
    let frame = 0;
    let lastTime = 0;
    const render = () => {
      items.forEach((item, i) => {
        item.style.translate = `${((i - current) * metrics.step).toFixed(2)}px 0`;
      });
    };
    const tick = (time) => {
      const goal = target();
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 1 / 60;
      lastTime = time;
      if (current === null || reduceMotion.matches) {
        current = goal;
      } else {
        current += (goal - current) * (1 - Math.exp(-dt / SMOOTH_TIME)); // フレームレートに依存しない補間
        if (Math.abs(goal - current) < 0.0005) current = goal;
      }
      render();
      if (current !== goal) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        lastTime = 0;
      }
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    measure();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', () => {
      measure();
      current = null; // 画面サイズ変更時は補間せず正しい位置へ
      request();
    });
    request();
  };

  initMenu();
  initSmoothScroll();
  initFaq();
  initFadeInCards();
  initCardStackFallback();
  initWorriesSlide();
  initSlider();
})();
