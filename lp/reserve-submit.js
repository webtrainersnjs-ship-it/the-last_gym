/**
 * reserve-submit.js — 予約フォーム送信スクリプト（共通エンジン v2 / 2026-07-22）
 *
 * ============================================================================
 * ★ このファイルは全ブランド・全店舗共通です。編集しないでください。
 * ============================================================================
 *
 * 同一オリジンの reserve.php へ fetch で POST し、成否を判定して thanks へ遷移する。
 * 従来の hidden iframe 直送信は iOS Safari 等で reCAPTCHA に静かに失敗していたため置き換え。
 * フォーム項目には依存しない（data-relay の付いたフォームの入力欄を全て自動収集する）。
 *
 * 使い方（LP側）:
 *   <form action="reserve.php" method="post" class="contact-form" data-relay data-thanks="thanks.html">
 *   …
 *   </body> 直前に <script src="reserve-submit.js?v=20260722"></script>
 */
(function () {
        var form = document.querySelector('form.contact-form[data-relay]');
        if (!form) return;
        // 二重読み込みガード: 旧インライン版の消し忘れ等で2回読み込まれても
        // submit リスナーを重複登録しない（二重送信防止）。
        if (form.dataset.relayBound === '1') return;
        form.dataset.relayBound = '1';

        var btn = form.querySelector('button[type="submit"], .submit-btn');
        var thanksUrl = form.getAttribute('data-thanks') || 'thanks.html';
        var sending = false;

        function showError(msg) {
                var box = form.querySelector('.relay-error');
                if (!box) {
                        box = document.createElement('p');
                        box.className = 'relay-error';
                        box.setAttribute('role', 'alert');
                        box.style.cssText = 'color:#c00;margin-top:1em;font-weight:bold;';
                        form.appendChild(box);
                }
                box.textContent = msg;
        }
        function clearError() {
                var box = form.querySelector('.relay-error');
                if (box) box.textContent = '';
        }

        form.addEventListener('submit', function (e) {
                e.preventDefault();
                if (sending) return;
                if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
                        if (typeof form.reportValidity === 'function') form.reportValidity();
                        return;
                }
                clearError();
                sending = true;
                var origText = btn ? btn.textContent : '';
                if (btn) { btn.disabled = true; btn.textContent = '送信中…'; }

                var data = new URLSearchParams();
                Array.prototype.forEach.call(form.elements, function (el) {
                        if (!el.name || el.disabled) return;
                        if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
                        data.append(el.name, el.value);
                });

                var ctrl = new AbortController();
                var timer = setTimeout(function () { ctrl.abort(); }, 20000);

                fetch(form.getAttribute('action'), {
                        method: 'POST',
                        headers: {
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'Accept': 'application/json'
                        },
                        credentials: 'same-origin',
                        body: data.toString(),
                        signal: ctrl.signal
                })
                .then(function (res) {
                        clearTimeout(timer);
                        return res.json().catch(function () { return { ok: false, error: '送信先から不正な応答が返りました（' + res.status + '）' }; })
                                .then(function (j) { return { status: res.status, body: j }; });
                })
                .then(function (r) {
                        if (r.body && r.body.ok === true) {
                                window.location.href = thanksUrl;
                        } else {
                                throw new Error((r.body && r.body.error) || ('送信に失敗しました（' + r.status + '）'));
                        }
                })
                .catch(function (err) {
                        clearTimeout(timer);
                        var msg = (err && err.name === 'AbortError')
                                ? '送信がタイムアウトしました。通信環境をご確認のうえ、再度お試しください。'
                                : (err && err.message ? err.message : '送信に失敗しました。通信環境をご確認のうえ、再度お試しください。');
                        showError(msg);
                        sending = false;
                        if (btn) { btn.disabled = false; btn.textContent = origText; }
                });
        });
})();
