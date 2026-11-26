$(document).ready(function () {
  // ハンバーガーメニュー
  $(".btn").on("click", function () {
    $(this).toggleClass("open");
    $("nav").toggleClass("open");
  });

  // メニュー項目クリックでメニューを閉じる
  $("nav a").on("click", function () {
    $(".btn").removeClass("open");
    $("nav").removeClass("open");
  });


  // お客様の声スライダー
  $('.voice-slider').slick({
    dots: true,
    fade: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    adaptiveHeight: true
  });

  // 店舗内装スライダー
  $('.slider').slick({
        centerMode: true,
        centerPadding: '40px',
        slidesToShow: 1,
        dots: true,
        arrows: false,
  });

  $('.access .js-details-summary').on('click', function (e) {
    e.preventDefault();

    const $details = $(this).closest('.js-details');
    const $content = $details.find('.details-content');
    const duration = 500;
    $('.access .js-details').not($details).each(function () {
      const $otherContent = $(this).find('.details-content');
      if (this.hasAttribute('open')) {
        const fullHeight = $otherContent[0].scrollHeight;

        $otherContent.css({
          maxHeight: fullHeight + 'px',
          opacity: 1,
        });

        requestAnimationFrame(() => {
          $otherContent.css({
            maxHeight: 0,
            opacity: 0,
            padding: '0 20px',
          });
        });

        setTimeout(() => {
          this.removeAttribute('open');
          $otherContent.css({
            maxHeight: '',
          });
        }, duration);
      }
    });

    // 自分の開閉
    if ($details.attr('open')) {
      // 閉じる
      const fullHeight = $content[0].scrollHeight;
      $content.css({
        maxHeight: fullHeight + 'px',
        opacity: 1,
      });

      requestAnimationFrame(() => {
        $content.css({
          maxHeight: 0,
          opacity: 0,
          padding: '0 20px',
        });
      });

      setTimeout(() => {
        $details.removeAttr('open');
        $content.css('max-height', '');
      }, duration);
    } else {
      $details.attr('open', true);
      const fullHeight = $content[0].scrollHeight;
      $content.css({
        maxHeight: 0,
        opacity: 0,
        padding: '0 20px',
      });

      requestAnimationFrame(() => {
        $content.css({
          maxHeight: fullHeight + 50 + 'px',
          opacity: 1,
          padding: '20px',
        });
      });

      setTimeout(() => {
        $content.css('max-height', 'none');
      }, duration);
    }
  });
});
