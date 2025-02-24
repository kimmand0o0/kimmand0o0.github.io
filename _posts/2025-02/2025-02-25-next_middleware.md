---
layout: post
title: Next.js - middleware로 유저 인증하기
author: haeran
date: 2025-02-25 21:07:00 +0900
categories: [Study]
banner:
  image: https://github.com/user-attachments/assets/25051e8a-2ee1-4b36-a371-435664a0e9a3
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Study, Next.js]
---

## 📌 Middleware 개요
Next.js의 **Middleware**는 사용자의 요청(Request)을 처리하기 전에 실행되는 코드로, 요청을 변경하거나 특정 조건에 따라 다른 응답을 반환하는 데 사용됩니다. Next.js Middleware는 **Edge Runtime**에서 실행되며, 서버리스 환경에서도 작동할 수 있습니다.

---

## 📌 Middleware 기본 구조

`middleware.ts` 파일을 프로젝트 루트에 추가하여 사용합니다.

### 1️⃣ 기본 예제
```typescript
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value
  const { pathname } = req.nextUrl

  // 로그인 여부에 따라 페이지 이동
  if (!token && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next(); // 요청 계속 진행
}

// 특정 경로에만 Middleware 적용할 수 있습니다.
// 저는 static, image, favicon, api, image, pay를 제외시켰습니다.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|^/pay).*)",],
};
```

## 📌 Middleware 실행 흐름
1. 클라이언트 요청 발생
2. `middleware.ts` 실행 (요청 변경 가능)
3. `NextResponse.next()` 호출 시 원래 요청된 페이지로 진행
4. `NextResponse.redirect()` 또는 `NextResponse.rewrite()`를 통해 요청 경로 변경 가능

## 📌 Middleware 주요 기능

### ✅ 1. 리디렉션 (Redirect)
사용자가 특정 페이지에 접근하면 강제로 다른 페이지로 이동시킵니다.
```typescript
export function middleware(req: NextRequest) {
  return NextResponse.redirect(new URL('/new-page', req.url));
}
```

### ✅ 2. URL 재작성 (Rewrite)
URL을 변경하지만 브라우저 URL은 유지됩니다.
```typescript
export function middleware(req: NextRequest) {
  return NextResponse.rewrite(new URL('/new-path', req.url));
}
```

### ✅ 3. 헤더 변경
```typescript
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('X-Custom-Header', 'Hello');
  return res;
}
```

### ✅ 4. 쿠키 조작
```typescript
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.cookies.set('token', '123456');
  return res;
}
```

---

## 📌 특정 경로에만 Middleware 적용 (Matcher)
`config.matcher`를 사용하면 특정 경로에만 Middleware를 적용할 수 있습니다.

```typescript
export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*'],
};
```

- `/admin/*` 및 `/dashboard/*` 경로에만 Middleware 적용

---

## 📌 Middleware vs API Route vs Server Components

| 기능 | Middleware | API Route | Server Component |
|------|-----------|-----------|------------------|
| 실행 시점 | 요청 전에 실행 | 요청 시 실행 | 페이지 렌더링 중 실행 |
| Edge 실행 | ✅ | ❌ | ❌ |
| 요청 수정 | ✅ | ❌ | ❌ |
| 데이터 패칭 | ❌ | ✅ | ✅ |
| 리디렉트 가능 | ✅ | ✅ | ❌ |

Middleware는 요청을 가로채고 변경하는 역할을 하며, API Route나 Server Component와 다르게 **Edge에서 실행 가능**하다는 점이 특징입니다.

---

## ✅ 실제 사용 예시: 로그인 체크 및 리디렉트
```typescript
export function middleware(req: NextRequest) {
  const token = req.cookies.get('auth');

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

➡ `/dashboard`에 접근하려면 `auth` 쿠키가 있어야 하며, 없으면 `/login`으로 이동합니다.

---

## 📌 정리
- `middleware.ts` 파일에서 `export function middleware()`을 정의하여 사용
- `NextRequest`와 `NextResponse`를 활용해 요청을 수정 가능
- `NextResponse.next()`, `NextResponse.redirect()`, `NextResponse.rewrite()` 등의 메서드 제공
- `config.matcher`를 활용하여 특정 경로에서만 실행 가능