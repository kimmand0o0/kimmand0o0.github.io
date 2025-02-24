---
layout: post
title: Next.js server와 client의 다른 fetch...
author: haeran
date: 2025-02-26 21:07:00 +0900
categories: [Study]
banner:
  image: https://github.com/user-attachments/assets/276f228d-022a-4957-bb82-65f97d4ff924
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Study, Next.js]
---


## 🚀 서버(Server)에서는 URL이 필요 없는 이유
Next.js 서버는 **배코드 환경(Node.js)에서 실행**되기 때문에, 서버 내부에서 API를 호출할 때는 **절대 URL이 필요하지 않음**.  
상대 경로(`/api/something`)만 사용해도 요청을 처리할 수 있다.

### 예제 코드
```ts
// pages/api/example.ts
export default function handler(req, res) {
  res.status(200).json({ message: "Hello from API!" });
}

// pages/index.tsx (서버에서 실행)
export async function getServerSideProps() {
  const res = await fetch(`/api/example`); // 절대 URL 불필요
  const data = await res.json();

  return { props: { data } };
}
```

### 이유
1. `fetch("/api/example")` 하면 Next.js 서버 내부에서 처리되는 것이기 때문에, **절대 URL 없이 상대 경로만으로 요청 가능**.
2. API 라우트(`/api/*`)는 **Next.js 서버가 직접 처리**하는 것이기 때문에, 요청을 외부 네트워크로 보내지 않음.

---

## 🌍 클라이언트(Client)에서는 URL이 필요한 이유
클라이언트는 **브라우저에서 실행**되는데, API 요청을 할 때는 **절대 URL이 필요**하다.  
`fetch`를 사용할 때 `http://localhost:3000/api/something` 또는 배포된 도메인(예: `https://myapp.com/api/something`)을 명시해야 한다.

### 예제 코드
```ts
// components/Example.tsx (클라이언트에서 실행)
import { useEffect, useState } from "react";

export default function Example() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("http://localhost:3000/api/example") // 절대 URL 필요
      .then((res) => res.json())
      .then((data) => setData(data));
  }, []);

  return <div>{data ? data.message : "Loading..."}</div>;
}
```

### 이유
1. **브라우저는 Next.js 서버와 분리된 환경**에서 실행되기 때문에, API 호출시 **정확한 주소(절대 URL)**가 필요함.
2. 클라이언트에서 `fetch("/api/example")`만 사용하면, **현재 페이지 URL 기준으로 요청**해서 경로가 꼽일 수 있음.
3. 배포된 환경에서는 `localhost`가 아니라 실제 도메인(`https://myapp.com/api/something`)을 사용해야 하기 때문.

![client와server의fetch](https://github.com/user-attachments/assets/0533d3cc-09e7-4493-8e2b-b91fa6f9c526)

## ✅ 정리
| 실행 환경 | URL 필요 여부 | 이유 |
|----------|------------|------|
| **서버 (Next.js API, `getServerSideProps`)** | ❌ 필요 없음 | 서버 내부에서 실행되는데 상대 경로 사용 가능 |
| **클라이언트 (React 컴포넌트, `useEffect`)** | ✅ 필요함 | 브라우저에서 API 호출할 때 절대 URL 필요 |