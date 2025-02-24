---
layout: post
title: 다이나믹 라우트(Dynamic Route)의 슬러그(Slug)가 뭐지?
author: haeran
date: 2025-02-24 21:07:00 +0900
categories: [Study]
banner:
  image: https://github.com/user-attachments/assets/423c9943-b407-4482-84c1-cfedc2afc245
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Study, Next.js]
---

### Next.js에서 다이나믹 라우트(Dynamic Route)에서 슬러그(Slug)
Next.js에서 다이나믹 라우트에서 **슬러그(Slug)** 는 URL의 특정 부분을 변수처럼 다루는 역할을 합니다.

### 📌 "슬러그(Slug)"의 의미
"슬러그(Slug)"는 웹 개발에서 **URL의 식별자 역할을 하는 문자열**을 의미해요.  
주로 페이지나 포스트의 고유한 부분을 가리키며, 보통 **영어 소문자와 하이픈(-)을 사용**해서 사람이 읽기 쉬운 형태로 만듭니다.

예를 들어:

- `https://example.com/blog/nextjs-routing`
- `https://example.com/product/iphone-15-pro`

여기서 **"nextjs-routing"** 이나 **"iphone-15-pro"** 같은 부분이 **슬러그(slug)** 입니다.

---

### 📌 슬러그 예제
다음과 같이 `pages/blog/[slug].js` 파일을 만들었다고 가정해 보겠습니다.

```jsx
import { useRouter } from 'next/router';

const BlogPost = () => {
  const router = useRouter();
  const { slug } = router.query;

  return <h1>블로그 포스트: {slug}</h1>;
};

export default BlogPost;
```

#### 🔹 해당 페이지의 동작 방식
이제 아래와 같은 URL을 입력하면:

- `/blog/nextjs-routing` → `slug = "nextjs-routing"`
- `/blog/how-to-use-api` → `slug = "how-to-use-api"`

이렇게 URL의 일부가 **동적으로 변경되는 값(slug)** 으로 사용됩니다.

---

### 📌 다중 슬러그 (Catch-all Routes)
여러 개의 동적 경로를 처리하고 싶다면 `[...slug].js`를 사용할 수도 있습니다.

예를 들어, `pages/blog/[...slug].js` 를 만들면 `/blog/category/javascript/react` 같은 경로를 배열로 받을 수 있습니다.

```jsx
import { useRouter } from 'next/router';

const BlogPost = () => {
  const router = useRouter();
  const { slug } = router.query;

  return <h1>Slug 값: {JSON.stringify(slug)}</h1>;
};

export default BlogPost;
```

#### 🔹 해당 페이지의 동작 방식
- `/blog/category/javascript` → `slug = ["category", "javascript"]`
- `/blog/category/javascript/react` → `slug = ["category", "javascript", "react"]`

이처럼 **여러 개의 동적 경로를 배열 형태로 받을 수 있습니다.**  
Next.js에서 다이나믹 라우트 슬러그는 URL에서 특정 값을 변수처럼 활용하는 중요한 개념이에요! 🚀

---

### 📌 왜 "Slug"라고 부를까?
"Slug"라는 단어는 원래 **신문사**에서 유래했어요.  
신문사에서는 기사나 원고를 식별하기 위해 **짧고 고유한 이름(코드)을 붙이는 것**을 "slug"라고 불렀어요.  
웹 개발에서도 **URL에서 페이지나 콘텐츠를 식별하는 역할**을 하기 때문에 같은 개념이 사용된 거예요.

📖 **어원 정리**
- **신문사에서 기사 제목을 짧게 줄여 쓰던 용어** → **웹에서 URL의 특정 부분을 의미하는 용어로 발전**

---

### 📌 슬러그의 특징
1. **고유해야 함** → 같은 페이지에 중복된 슬러그가 있으면 안 됨.
2. **SEO(검색 엔진 최적화)에 유리** → 사람이 읽기 쉬운 URL이 검색에 더 잘 노출됨.
3. **소문자와 하이픈(-) 사용이 일반적** → 띄어쓰기는 `%20`(공백) 대신 하이픈을 사용해서 가독성을 높임.

📌 **예제 비교**
✅ **좋은 슬러그:**
- `/blog/how-to-use-nextjs`
- `/product/iphone-15-pro`

❌ **나쁜 슬러그:**
- `/blog/HowToUseNextJS` (대소문자 혼용)
- `/product/iphone_15_pro` (언더스코어 `_` 대신 하이픈 `-` 사용 권장)

---

### 📌 정리
✅ **슬러그(Slug)** 는 웹 URL에서 특정 콘텐츠를 가리키는 짧고 고유한 식별자!  
✅ **신문사에서 사용하던 용어**가 웹 개발로 넘어와 정착된 개념!  
✅ **SEO와 가독성**을 위해 짧고 의미 있게 작성하는 것이 중요! 🚀