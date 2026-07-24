package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// defaultSecurityHeaders returns the map of default security headers
func defaultSecurityHeaders() map[string]string {
	return map[string]string{
		"Content-Security-Policy": "base-uri 'none'; child-src 'none'; connect-src 'self'; default-src 'none'; fenced-frame-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'; img-src 'self'; manifest-src 'self'; media-src 'self'; object-src 'none'; script-src 'self' 'https://cdn.jsdelivr.net'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; upgrade-insecure-requests; worker-src 'self' https://cdn.jsdelivr.net",
		"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
		"Permissions-Policy": "accelerometer=(), ambient-light-sensor=(), attribution-reporting=(), autoplay=(), battery=(), browsing-topics=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(self), gamepad=(), geolocation=(), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), interest-cohort=(), join-ad-interest-group=(), keyboard-map=(), local-fonts=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), private-state-token-issuance=(), private-state-token-redemption=(), publickey-credentials-get=(), run-ad-auction=(), screen-wake-lock=(), serial=(), sync-xhr=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()",
		"X-XSS-Protection":           "0",
		"X-Frame-Options":            "DENY",
		"X-Content-Type-Options":     "nosniff",
		"Referrer-Policy":            "strict-origin-when-cross-origin",
		"Cross-Origin-Embedder-Policy": "require-corp",
		"Cross-Origin-Opener-Policy": "same-site",
		"Cross-Origin-Resource-Policy": "same-site",
	}
}

// blockedHeaders returns the list of headers to block/remove
func blockedHeaders() []string {
	return []string{"Public-Key-Pins", "X-Powered-By", "X-AspNet-Version"}
}

// getTLSVersion extracts TLS version from request (simplified version)
func getTLSVersion(r *http.Request) string {
	if r.TLS != nil {
		version := r.TLS.Version
		switch version {
		case 0x0301:
			return "TLSv1.0"
		case 0x0302:
			return "TLSv1.1"
		case 0x0303:
			return "TLSv1.2"
		case 0x0304:
			return "TLSv1.3"
		default:
			return "unknown"
		}
	}
	return "unknown"
}

// CheckTLSVersion checks if the TLS version is valid (1.2 or higher)
func CheckTLSVersion(r *http.Request) bool {
	tlsVersion := getTLSVersion(r)
	validVersions := []string{"TLSv1.2", "TLSv1.3"}
	
	for _, v := range validVersions {
		if tlsVersion == v {
			return true
		}
	}
	return false
}

// HandleSecurityHeaders is the main handler function
func HandleSecurityHeaders(w http.ResponseWriter, r *http.Request) {
	// Check TLS version
	if !CheckTLSVersion(r) {
		http.Error(w, "You need to use TLS version 1.2 or higher.", http.StatusBadRequest)
		return
	}

	// Create a response recorder to capture the original response
	recorder := NewResponseRecorder(w)
	
	// Create a new request to forward (simplified - in production you'd use a reverse proxy)
