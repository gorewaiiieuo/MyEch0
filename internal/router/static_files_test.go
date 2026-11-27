// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025-2026 lin-snow

package router

import (
	"mime"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRegisterStaticFilesServesOnlyMedia(t *testing.T) {
	gin.SetMode(gin.TestMode)

	root := t.TempDir()
	for rel, body := range map[string]string{
		"images/a.png": "png",
		"snapshots/ech0_snapshot_2026-01-01_00-00-00.zip": "secret",
	} {
		path := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	engine := gin.New()
	registerStaticFiles(engine, root)

	cases := []struct {
		path string
		want int
	}{
		{"/api/files/images/a.png", http.StatusOK},
		{"/api/files/snapshots/ech0_snapshot_2026-01-01_00-00-00.zip", http.StatusNotFound},
		{"/api/files/snapshots/", http.StatusNotFound},
		{"/api/files/", http.StatusNotFound},
		{"/api/files/ech0.db", http.StatusNotFound},
	}
	for _, tc := range cases {
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if recorder.Code != tc.want {
			t.Fatalf("GET %s = %d, want %d", tc.path, recorder.Code, tc.want)
		}
	}
}

func TestStaticOriginalDownload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "images"), 0o755); err != nil {
		t.Fatal(err)
	}
	content := []byte("original JPEG bytes including an embedded movie and manufacturer trailer")
	if err := os.WriteFile(filepath.Join(root, "images", "original.jpg"), content, 0o644); err != nil {
		t.Fatal(err)
	}
	engine := gin.New()
	registerStaticFiles(engine, root)
	name := "手机动态照片.jpg"
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/files/images/original.jpg?download=1&filename="+url.QueryEscape(name), nil))
	disposition, params, err := mime.ParseMediaType(recorder.Header().Get("Content-Disposition"))
	if err != nil || disposition != "attachment" || params["filename"] != name {
		t.Fatalf("incorrect attachment header: %q (%v)", recorder.Header().Get("Content-Disposition"), err)
	}
	if recorder.Code != http.StatusOK || recorder.Body.String() != string(content) {
		t.Fatalf("download must preserve all original bytes: status=%d", recorder.Code)
	}
	preview := httptest.NewRecorder()
	engine.ServeHTTP(preview, httptest.NewRequest(http.MethodGet, "/api/files/images/original.jpg", nil))
	if preview.Header().Get("Content-Disposition") != "" {
		t.Fatal("normal image viewing must remain inline")
	}
	blocked := httptest.NewRecorder()
	engine.ServeHTTP(blocked, httptest.NewRequest(http.MethodGet, "/api/files/ech0.db?download=1", nil))
	if blocked.Code != http.StatusNotFound {
		t.Fatal("download option must not expose non-media files")
	}
}
