---
layout: post
title: vitest 'mockResolvedValue' 속성 없음
author: haeran
date: 2025-03-02 21:07:00 +0900
categories: [Study]
banner:
  image: https://github.com/user-attachments/assets/c51a6630-8d5f-466b-b844-8abc28f02a96
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Study, Prisma]
---

작업을 하던 중 Database와 연결이 계속해서 끊어지는 상황이 발생...

<img width="912" alt="prisma0" src="https://github.com/user-attachments/assets/b52fea39-833e-41e2-8e3d-d27f31c7de85" />

Prisma를 사용해 데이터베이스와 연결한 후 연결을 닫지 않으면, 데이터베이스의 연결 수가 한정되어 있기 때문에 연결을 닫지 않은 상태로 여러 번 요청을 보내게 되면 연결 수가 초과되어 더 이상 새로운 연결을 할 수 없게 됩니다. 이는 연결을 재사용하지 않고 계속해서 새로운 연결을 열기 때문에 발생하는 문제입니다.

### 원인

Prisma에서 데이터베이스에 접근할 때마다 새로운 연결을 만들고, 그 연결을 명시적으로 닫지 않으면 연결을 재사용하지 못하고 계속해서 새로 연결을 시도하게 됩니다. 데이터베이스 서버에는 연결 수에 제한이 있기 때문에, 이 제한을 초과하면 더 이상 새 연결을 만들 수 없습니다.

### 해결

이를 해결하려면 데이터베이스와의 연결을 명시적으로 닫아 연결 수를 효율적으로 관리해야 합니다. 이를 위해 Prisma에서 제공하는 finally 블럭을 사용하여 연결을 종료하는 방법을 적용할 수 있습니다. finally 블럭은 예외가 발생하든 안 하든 항상 실행되므로, 코드 실행이 완료된 후 연결을 확실히 끊을 수 있습니다.

- try-catch 블럭: try 블럭 안에서 Prisma를 통해 데이터베이스 작업을 시도합니다. 예외가 발생할 경우, catch 블럭에서 예외를 처리할 수 있습니다.
- finally 블럭: finally 블럭 안에서 prisma.$disconnect()를 호출하여 데이터베이스 연결을 명시적으로 종료합니다. 이 코드가 항상 실행되기 때문에 예외가 발생하더라도 연결을 끊을 수 있습니다.

![prisma](https://github.com/user-attachments/assets/84c941fc-8071-4339-b791-1f85562073b8)
![prisma1](https://github.com/user-attachments/assets/4ffd2631-b429-4e10-afb5-4b8edac60f4b)
