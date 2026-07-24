use std::collections::HashMap;
use worker::*;

#[event(fetch)]
async fn fetch(req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    let default_security_headers = HashMap::from([
        (
            "Content-Security-Policy",
            "base-uri 'none'; child-src 'none'; connect-src 'self'; default-src 'none'; fenced-frame-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'; img-src 'self'; manifest-src 'self'; media-src 'self'; object-src 'none'; script-src 'self' 'https://cdn.jsdelivr.net'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; upgrade-insecure-requests; worker-src 'self' 'https://cdn.jsdelivr.net'",
        ),
        (
            "Strict-Transport-Security",
            "max-age=63072000; includeSubDomains; preload",
        ),
        (
            "Permissions-Policy",
            "accelerometer=(), ambient-light-sensor=(), attribution-reporting=(), autoplay=(), battery=(), browsing-topics=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(self), gamepad=(), geolocation=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), interest-cohort=(), join-ad-interest-group=(), keyboard-map=(), local-fonts=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), private-state-token-issuance=(), private-state-token-redemption=(), publickey-credentials-get=(), run-ad-auction=(), screen-wake-lock=(), serial=(), sync-xhr=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()",
        ),
        ("X-XSS-Protection", "0"),
        ("X-Frame-Options", "DENY"),
        ("X-Content-Type-Options", "nosniff"),
        ("Referrer-Policy", "no-referrer"),
        ("Cross-Origin-Embedder-Policy", "require-corp"),
        ("Cross-Origin-Opener-Policy", "same-site"),
        ("Cross-Origin-Resource-Policy", "same-site"),
    ]);
    let blocked_headers = ["Public-Key-Pins", "X-Powered-By", "X-AspNet-Version"];
    let tls = req.cf().unwrap().tls_version();
    let res = Fetch::Request(req).send().await?;
    let mut new_headers = res.headers().clone();

    if Some(String::from("text/html")) == new_headers.get("Content-Type")? {
        return Ok(Response::from_body(res.body().clone())?
            .with_headers(new_headers)
            .with_status(res.status_code()));
    }
    for (k, v) in default_security_headers {
        new_headers.set(k, v)?;
    }

    for k in blocked_headers {
        new_headers.delete(k)?;
    }

    if !vec!["TLSv1.2", "TLSv1.3"].contains(&tls.as_str()) {
        return Response::error("You need to use TLS version 1.2 or higher.", 400);
    }
    Ok(Response::from_body(res.body().clone())?
        .with_headers(new_headers)
        .with_status(res.status_code()))
}
