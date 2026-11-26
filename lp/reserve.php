<?php
/**
 * reserve.php — 予約フォーム サーバ中継エンドポイント（共通エンジン v2 / 2026-07-22）
 *
 * ============================================================================
 * ★ このファイルは全ブランド・全店舗共通の「エンジン」です。編集しないでください。
 * ★ 店舗ごとの設定は同じフォルダの form-config.php にあります。
 * ============================================================================
 *
 * 目的:
 *   LP の予約フォームから受けた POST を、サーバ(PHP+cURL)から Google フォームの
 *   formResponse へ中継する。これにより iOS Safari / WebKit ITP 環境で発生していた
 *   「hidden iframe 内 reCAPTCHA による静かな送信失敗」を回避し、かつサーバ側で
 *   応答を検査して成否を確実に判定する。
 *
 * 設計上の要点:
 *   - 受け取った entry.* の値は **一切再構築せず、生の UTF-8 バイト列のまま** Google へ転送する。
 *     これにより「9:00〜9:45」等の 〜 (U+301C, e3 80 9c) が壊れない（無効選択肢化を防ぐ）。
 *   - 送信先・許可項目は form-config.php に分離（1フォルダ=1店舗）。
 *   - 成否判定は「明確に受理と分かる応答のみ成功」。判定不能は失敗(502)に倒す。
 *   - GAS の Form/Sheet トリガー（管理者通知・自動返信）は正規 formResponse 経由でのみ発火する。
 *     本中継は正規 formResponse に POST するため GAS パイプラインはそのまま動く。
 *
 * デプロイ:
 *   各 LP の Web ルート直下（index.html と同じ階層）に form-config.php / reserve-submit.js と
 *   一緒に配置する。LP からは同一オリジンの相対パス `reserve.php` に fetch で POST する。
 *   設置確認: reserve.php?health=1 が {"ok":true,...} を返せば設定込みで正常。
 */

declare(strict_types=1);

// 本番ではPHPエラーを画面に出さない（情報漏えい防止）。ログには残す。
// Xserver(FastCGI)では .htaccess の php_value が500を招くため、PHP側で設定する。
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// Google formResponse へ付与する互換性向上フィールド（単一ページ・公開フォーム向け）。
// fvv=1/pageHistory=0/submit=Submit は安全側の補助値。fbzx/partialResponse/draftResponse は
// ブラウザ生成の値で、雑に合成すると逆に不安定になるため付与しない。
const EXTRA_GOOGLE_FIELDS = ['fvv' => '1', 'pageHistory' => '0', 'submit' => 'Submit'];

// レート制限: 同一 IP ×同一フォーム あたり WINDOW 秒間に MAX 回まで。
const RATE_LIMIT_MAX    = 8;
const RATE_LIMIT_WINDOW = 600; // 秒

// ----------------------------------------------------------------------------
// 設定読み込み・検証
// ----------------------------------------------------------------------------
/**
 * form-config.php を読み込み検証する。不備は RuntimeException（呼び出し側で 500 に変換）。
 * 戻り値には form_id / form_response / form_view を導出して追加する。
 */
function loadConfig(string $path): array
{
    try {
        if (!is_file($path)) {
            throw new RuntimeException('form-config.php not found');
        }
        $c = require $path; // require_once は2回目に true を返すため使わない
    } catch (RuntimeException $e) {
        throw $e;
    } catch (Throwable $e) {
        throw new RuntimeException('config load error: ' . $e->getMessage());
    }
    if (!is_array($c)) {
        throw new RuntimeException('config must return array');
    }
    $u = (string)($c['form_url'] ?? '');
    if (!preg_match('#^https://docs\.google\.com/forms/d/e/([A-Za-z0-9_-]{20,})/viewform#', $u, $m)) {
        throw new RuntimeException('form_url must be a public viewform URL (https://docs.google.com/forms/d/e/…/viewform). 編集画面URL(/d/…/edit)は不可');
    }
    $c['form_id']       = $m[1];
    $c['form_response'] = 'https://docs.google.com/forms/d/e/' . $m[1] . '/formResponse';
    $c['form_view']     = 'https://docs.google.com/forms/d/e/' . $m[1] . '/viewform';

    foreach (['expected_entries', 'required_entries'] as $k) {
        if (empty($c[$k]) || !is_array($c[$k])) {
            throw new RuntimeException($k . ' must be a non-empty array');
        }
        foreach ($c[$k] as $e) {
            if (!is_string($e) || !preg_match('/^entry\.\d+$/', $e)) {
                throw new RuntimeException($k . ': bad entry id: ' . var_export($e, true));
            }
        }
    }
    if (array_diff($c['required_entries'], $c['expected_entries'])) {
        throw new RuntimeException('required_entries must be a subset of expected_entries');
    }
    if (empty($c['allowed_origins']) || !is_array($c['allowed_origins'])) {
        throw new RuntimeException('allowed_origins is required (本番ドメインを設定する)');
    }
    foreach ($c['allowed_origins'] as $o) {
        if (!is_string($o) || !preg_match('#^https?://[^/\s]+$#', $o)) {
            throw new RuntimeException('allowed_origins: bad origin: ' . var_export($o, true));
        }
    }
    if (!is_string($c['label'] ?? null) || !preg_match('/^[^\r\n\t]{1,80}$/u', $c['label'])) {
        throw new RuntimeException('label is required (80文字以内・改行タブ不可)');
    }
    // Google フォーム側に質問が無いことが分かっている送信項目（例: UTM計測用 hidden）。
    // expected_entries に含めた上でここに列挙すると、検査ツールが「既知の例外」として扱う。
    $c['passthrough_entries'] = $c['passthrough_entries'] ?? [];
    if (!is_array($c['passthrough_entries'])) {
        throw new RuntimeException('passthrough_entries must be an array');
    }
    foreach ($c['passthrough_entries'] as $e) {
        if (!is_string($e) || !preg_match('/^entry\.\d+$/', $e)) {
            throw new RuntimeException('passthrough_entries: bad entry id: ' . var_export($e, true));
        }
    }
    if (array_diff($c['passthrough_entries'], $c['expected_entries'])) {
        throw new RuntimeException('passthrough_entries must be a subset of expected_entries');
    }
    $c['legacy_site'] = (isset($c['legacy_site']) && is_string($c['legacy_site']) && $c['legacy_site'] !== '')
        ? $c['legacy_site'] : null;
    return $c;
}

// ----------------------------------------------------------------------------
// ヘルパ
// ----------------------------------------------------------------------------
function respond(int $httpStatus, array $payload): void
{
    http_response_code($httpStatus);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function clientIp(): string
{
    // Xserver 等の共用環境では REMOTE_ADDR を信頼する（X-Forwarded-For は偽装可能なので使わない）。
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * レート制限（ファイルベース・排他ロック）。
 * 「読込→判定→書込」を flock(LOCK_EX) で1つの排他区間にまとめる。
 * FastCGI で複数プロセスが同時実行されても取りこぼし/すり抜けが起きないようにする。
 * キーは「フォームIDハッシュ + IP」: 同一サーバー上の複数LPで制限が干渉しない。
 */
function rateLimitOk(string $formKey): bool
{
    $dir = sys_get_temp_dir() . '/reserve_rl';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    $key  = $formKey . '_' . sha1(clientIp());
    $file = $dir . '/' . $key . '.json';
    $now  = time();

    $fh = @fopen($file, 'c+');
    if ($fh === false) {
        return true; // ロックファイルを作れない場合は可用性優先で通す
    }
    if (!flock($fh, LOCK_EX)) {
        fclose($fh);
        return true;
    }
    $raw  = stream_get_contents($fh);
    $data = $raw ? json_decode($raw, true) : [];
    $hits = is_array($data)
        ? array_values(array_filter($data, static fn($t) => ($now - (int)$t) < RATE_LIMIT_WINDOW))
        : [];

    $ok = count($hits) < RATE_LIMIT_MAX;
    if ($ok) {
        $hits[] = $now;
        rewind($fh);
        ftruncate($fh, 0);
        fwrite($fh, json_encode($hits));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $ok;
}

/**
 * application/x-www-form-urlencoded の生ボディを自前パースする。
 * PHP の $_POST / parse_str はキー内の "." を "_" に変換してしまうため
 * （例: entry.123 → entry_123）、Google フォームの entry.NNN を保持できない。
 * ここで生ボディを直接パースし、ドット付きキーをそのまま保持する。
 * 値は urldecode するだけで再エンコードしないので UTF-8 バイト列（U+301C 等）は保たれる。
 * 同名キーは配列に積む（Google フォームのチェックボックス質問対応）。
 *
 * @return array<string, string|list<string>>
 */
function parseFormUrlEncoded(string $raw): array
{
    $out = [];
    if ($raw === '') {
        return $out;
    }
    foreach (explode('&', $raw) as $pair) {
        if ($pair === '') {
            continue;
        }
        $eq = strpos($pair, '=');
        if ($eq === false) {
            $key = urldecode($pair);
            $val = '';
        } else {
            $key = urldecode(substr($pair, 0, $eq));
            $val = urldecode(substr($pair, $eq + 1));
        }
        if (!array_key_exists($key, $out)) {
            $out[$key] = $val;
        } elseif (is_array($out[$key])) {
            $out[$key][] = $val;
        } else {
            $out[$key] = [$out[$key], $val];
        }
    }
    return $out;
}

/**
 * Google へ送る urlencoded ボディを構築する。
 * http_build_query は配列値を entry.N[0] 形式にしてしまうため使わない。
 * rawurlencode（RFC3986）で k=v を自前連結し、配列値は同名キーを複数回出力する。
 * 受信値 $fields を先に置き、$extra で上書きしない。
 *
 * @param array<string, string|list<string>> $fields
 * @param array<string, string>              $extra
 */
function buildGoogleBody(array $fields, array $extra): string
{
    $pairs = [];
    foreach ($fields as $k => $v) {
        foreach (is_array($v) ? $v : [$v] as $one) {
            $pairs[] = rawurlencode($k) . '=' . rawurlencode((string)$one);
        }
    }
    foreach ($extra as $k => $v) {
        if (!array_key_exists($k, $fields)) {
            $pairs[] = rawurlencode($k) . '=' . rawurlencode($v);
        }
    }
    return implode('&', $pairs);
}

/**
 * Google formResponse の応答を分類する。
 * 「明確に受理と分かる応答のみ成功」。判定不能(indeterminate)は失敗として扱う
 * （間違ったフォームID等で 200 が返っても成功に見えない = クライアント単独運用の要）。
 *
 * @return array{accepted: bool, reason: string}
 */
function classifyGoogleResponse(int $curlErrNo, int $httpCode, string $finalUrl, string $body): array
{
    if ($curlErrNo !== 0) {
        return ['accepted' => false, 'reason' => 'network'];
    }
    $host = strtolower((string)(parse_url($finalUrl, PHP_URL_HOST) ?? ''));
    if (strpos($host, 'accounts.google.com') !== false || stripos($finalUrl, 'ServiceLogin') !== false) {
        return ['accepted' => false, 'reason' => 'login'];
    }
    if ($httpCode !== 200) {
        return ['accepted' => false, 'reason' => 'http-' . $httpCode];
    }
    if (stripos($body, 'recaptcha') !== false) {
        return ['accepted' => false, 'reason' => 'recaptcha'];
    }
    if (stripos($body, '回答を受け付けていません') !== false
        || stripos($body, 'no longer accepting responses') !== false) {
        return ['accepted' => false, 'reason' => 'closed'];
    }
    // フォーム要素が残っている = フォーム(再)表示 = 未受理。
    // ※実物検証(2026-07-22): 確認ページにも FB_PUBLIC_LOAD_DATA_ は含まれるため
    //   それ自体は失敗マーカーにならない。<form action=…formResponse> の有無が確実な構造差。
    //   （なおサーバPOSTでの必須欠落は HTTP 400 が返るため、通常は上の http-4xx で先に捕捉される）
    //   引用符の種類・空白・改行の揺れも拾う。
    if (preg_match('#<form\b[^>]*\baction\s*=\s*["\']?[^"\'>]*formResponse#is', $body)) {
        return ['accepted' => false, 'reason' => 'redisplay'];
    }
    // 受理マーカー（既定文言・受理ページ固有リンク・旧UI構造クラス）
    $okMarkers = [
        '回答を記録しました',
        'Your response has been recorded',
        '別の回答を送信',
        'Submit another response',
        'freebirdFormviewerViewResponseConfirmationMessage',
    ];
    foreach ($okMarkers as $s) {
        if (stripos($body, $s) !== false) {
            return ['accepted' => true, 'reason' => 'accepted'];
        }
    }
    // 構造的受理: 最終URLが docs.google.com / フォーム定義はあるがフォーム要素が無い
    // = カスタム確認メッセージ等で既定文言が消えた確認ページ（実物検証に基づく判定）。
    // ログに accepted-structural と残し、監査可能にする。
    if ($host === 'docs.google.com' && strpos($body, 'FB_PUBLIC_LOAD_DATA_') !== false) {
        return ['accepted' => true, 'reason' => 'accepted-structural'];
    }
    return ['accepted' => false, 'reason' => 'indeterminate'];
}

// ----------------------------------------------------------------------------
// メインフロー
// ----------------------------------------------------------------------------
function reserveMain(): void
{
    // 0. 設定読み込み（メソッド判定より先。設定不備は GET でも検知できるようにする）
    try {
        $conf = loadConfig(__DIR__ . '/form-config.php');
    } catch (Throwable $e) {
        error_log('reserve.php config error: ' . $e->getMessage());
        respond(500, ['ok' => false, 'error' => '設定エラーです。form-config.php を確認してください。']);
    }
    $formKey = substr(sha1($conf['form_response']), 0, 12);

    // 0.2 実行環境チェック: cURL が無いサーバーでは実送信時に fatal になるため、
    //     ヘルスチェック段階で検出できるようにする（health の ok:true = 設定+環境OK の意味）。
    if (!function_exists('curl_init')) {
        error_log('reserve.php environment error: curl extension not available');
        respond(500, ['ok' => false, 'error' => 'サーバー環境エラーです（cURL拡張がありません）。サーバーのPHP設定を確認してください。']);
    }

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // 0.5 ヘルスチェック（設置確認用）。フォームURL全文は出さない。
    if ($method === 'GET' && (($_GET['health'] ?? '') === '1')) {
        respond(200, ['ok' => true, 'label' => $conf['label'], 'form' => $formKey]);
    }

    // 1. CORS（同一オリジン運用が前提。許可オリジンからのクロス利用のみヘッダ付与）
    $reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($reqOrigin !== '' && in_array($reqOrigin, $conf['allowed_origins'], true)) {
        header('Access-Control-Allow-Origin: ' . $reqOrigin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Accept');
        header('Access-Control-Max-Age: 86400');
    }
    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    // 2. メソッド検証
    if ($method !== 'POST') {
        respond(405, ['ok' => false, 'error' => 'Method Not Allowed']);
    }

    // 3. 生ボディをパース（ドット付き entry.NNN を保持するため $_POST は使わない）
    $IN = parseFormUrlEncoded(file_get_contents('php://input') ?: '');

    // 4. バージョン混在ガード:
    //    旧June版HTML は hidden `site` を送る。新方式のLPは送らない。
    //    `site` が来たのに legacy_site と一致しない場合は、旧HTML+新エンジンの
    //    取り違え（=過去に起きた先祖返り事故）なので、黙って転送せず止める。
    if (isset($IN['site'])) {
        $site = is_array($IN['site']) ? '' : (string)$IN['site'];
        if ($conf['legacy_site'] === null || $site !== $conf['legacy_site']) {
            error_log("reserve.php version mismatch: received site='$site' (legacy_site=" . var_export($conf['legacy_site'], true) . ')');
            respond(400, ['ok' => false, 'error' => 'フォームのバージョンが一致しません。設置ファイルを確認してください。']);
        }
    }

    // 5. Origin / Referer 検証（ヘッダが存在する場合のみ照合。
    //    Origin/Referer を送らない一部ブラウザの実ユーザーを 403 にしないため、両方空は許容）
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '' && isset($_SERVER['HTTP_REFERER'])) {
        $parts = parse_url($_SERVER['HTTP_REFERER']);
        if ($parts && isset($parts['scheme'], $parts['host'])) {
            $origin = $parts['scheme'] . '://' . $parts['host']
                . (isset($parts['port']) ? ':' . $parts['port'] : '');
        }
    }
    if ($origin !== '' && !in_array($origin, $conf['allowed_origins'], true)) {
        respond(403, ['ok' => false, 'error' => 'forbidden origin']);
    }

    // 6. ハニーポット（bot 対策）。`_hp` に値が入っていれば bot とみなし、成功偽装で握りつぶす。
    //    許可リスト検査より先に行う（bot に検証エラーの情報を返さない）。
    $hp = $IN['_hp'] ?? '';
    if ((is_string($hp) && $hp !== '') || (is_array($hp) && implode('', $hp) !== '')) {
        respond(200, ['ok' => true]); // bot には成功に見せて静かに破棄
    }

    // 7. レート制限
    if (!rateLimitOk($formKey)) {
        respond(429, ['ok' => false, 'error' => '時間をおいて再度お試しください。']);
    }

    // 8. entry.* の収集と許可リスト検査。値は加工せず生のまま使う。
    $fields = [];
    foreach ($IN as $name => $value) {
        if (strncmp($name, 'entry.', 6) !== 0) {
            continue;
        }
        if (!in_array($name, $conf['expected_entries'], true)) {
            // 想定外 entry = LPとフォームの対応表ズレ。黙って素通しせず止める（テスト送信で即発覚させる）
            error_log("reserve.php unexpected entry: $name (label={$conf['label']})");
            respond(400, ['ok' => false, 'error' => 'フォーム項目の対応が一致しません。設定を確認してください。', 'entry' => $name]);
        }
        $fields[$name] = $value;
    }
    if (!$fields) {
        respond(400, ['ok' => false, 'error' => 'no entries']);
    }

    // 9. 必須項目チェック
    $missing = [];
    foreach ($conf['required_entries'] as $req) {
        $v = $fields[$req] ?? '';
        $flat = is_array($v) ? implode('', $v) : $v;
        if (trim($flat) === '') {
            $missing[] = $req;
        }
    }
    if ($missing) {
        respond(422, ['ok' => false, 'error' => '必須項目が未入力です。', 'missing' => $missing]);
    }

    // 10. Google formResponse へ cURL 中継
    $body = buildGoogleBody($fields, EXTRA_GOOGLE_FIELDS);

    // ローカル検証専用の送信先オーバーライド。
    // 本番では無効。RESERVE_ALLOW_OVERRIDE=1 が明示された時だけ RESERVE_TARGET_OVERRIDE を採用する。
    $target        = $conf['form_response'];
    $allowOverride = getenv('RESERVE_ALLOW_OVERRIDE') === '1';
    $override      = getenv('RESERVE_TARGET_OVERRIDE');
    if ($allowOverride && is_string($override) && $override !== '') {
        $target = $override;
    }
    // 通信プロトコルは原則 HTTPS のみに固定（リダイレクト先も）。ローカル検証時のみ HTTP も許可。
    $protocols = $allowOverride ? (CURLPROTO_HTTPS | CURLPROTO_HTTP) : CURLPROTO_HTTPS;

    $ch = curl_init($target);
    curl_setopt_array($ch, [
        CURLOPT_POST            => true,
        CURLOPT_POSTFIELDS      => $body,
        CURLOPT_RETURNTRANSFER  => true,
        CURLOPT_FOLLOWLOCATION  => true,
        CURLOPT_MAXREDIRS       => 3,
        CURLOPT_PROTOCOLS       => $protocols,
        CURLOPT_REDIR_PROTOCOLS => $protocols,
        CURLOPT_TIMEOUT         => 15,
        CURLOPT_CONNECTTIMEOUT  => 8,
        CURLOPT_SSL_VERIFYPEER  => true,
        CURLOPT_HTTPHEADER      => [
            'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
            // ブラウザ的な UA / Referer を付与（サーバIPの bot 扱い・弾かれ防止）。
            'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            'Referer: ' . $conf['form_view'],
        ],
    ]);

    $responseBody = curl_exec($ch);
    $httpCode     = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $finalUrl     = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $curlErrNo    = curl_errno($ch);
    curl_close($ch);

    // 11. 成否判定（明確受理のみ成功。判定不能は 502 に倒す）
    $verdict = classifyGoogleResponse($curlErrNo, $httpCode, $finalUrl, (string)$responseBody);

    // 監視用の最小ログ（個人情報は残さない: label / formハッシュ / http / curl / 判定 / IPハッシュ）
    $logLine = sprintf(
        "%s\tlabel=%s\tform=%s\thttp=%d\tcurl=%d\tverdict=%s\tip=%s\n",
        gmdate('c'),
        $conf['label'],
        $formKey,
        $httpCode,
        $curlErrNo,
        $verdict['reason'],
        substr(sha1(clientIp()), 0, 12)
    );
    @file_put_contents(__DIR__ . '/reserve.log', $logLine, FILE_APPEND | LOCK_EX);

    if ($verdict['accepted']) {
        respond(200, ['ok' => true]);
    }
    respond(502, ['ok' => false, 'error' => '送信に失敗しました。時間をおいて再度お試しいただくか、お電話にてご連絡ください。']);
}

if (!defined('RESERVE_PHP_TEST')) {
    reserveMain();
}
