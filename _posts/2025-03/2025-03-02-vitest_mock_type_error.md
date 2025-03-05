---
layout: post
title: vitest 'mockResolvedValue' 속성 없음
author: haeran
date: 2025-03-02 21:07:00 +0900
categories: [Study]
banner:
  image: https://github.com/user-attachments/assets/96834c36-be06-4205-909f-c5e6a8b3d18a
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Test_code]
---

Jest에 대한 블로그 게시글은 많았지만 Vitest의 해당 에러에 대한 내용을 찾기 어려워 블로그 글로 남깁니다...

## 발생 에러 

```jsx
'() => Promise<{ id: number; userId: number; marimoId: number; status: string; amount: number; paymentKey: string; payResponse: JsonValue; createdAt: Date; updatedAt: Date; }[] | null>' 형식에 'mockResolvedValue' 속성이 없습니다.ts(2339)
```

'() => Promise<{ id: number; userId: number; marimoId: number; status: string; amount: number; paymentKey: string; payResponse: JsonValue; createdAt: Date; updatedAt: Date; }[] | null>' 형식에 'mockResolvedValue' 속성이 없습니다.ts(2339)

 mockResolvedValue는 일반적으로 Promise를 반환하는 함수에 대해 사용되는 jest의 mock 기능입니다. 이 에러는, 해당 mock 함수에 대해 mockResolvedValue를 사용하려고 했을 때, 그 함수의 타입에 mockResolvedValue 속성이 존재하지 않아서 발생하는 것입니다.

 mockResolvedValue는 기본적으로 vi.fn()으로 만들어진 mock 함수에서 사용되며, 해당 함수가 반환하는 값이 Promise일 때만 유효합니다.

### 해결 방법

- vi.fn()을 사용하여 mock 함수 만들기: 해당 함수가 Promise를 반환하는지 확인한 후, jest.fn() 또는 vi.fn()으로 mock을 생성해야 합니다.

- 타입 지정: mock 함수의 타입이 정확히 Promise를 반환하는 함수로 지정되어 있는지 확인합니다. 예를 들어, mockResolvedValue를 사용하려면 mockFn이 Promise를 반환해야 하고, 이 경우 다음과 같이 작성할 수 있습니다.

![mockResolvedValue](https://github.com/user-attachments/assets/2c55e764-eaa1-4d68-9d90-1f671d5a4f90)
![mockResolvedValue2](https://github.com/user-attachments/assets/52b39298-1330-4cc2-88e1-4bf3b1dd1395)
