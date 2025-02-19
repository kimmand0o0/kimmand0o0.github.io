---
layout: post
title: next image와 blur_image를 이용한 이미지 최적화
author: haeran
date: 2025-02-17 21:07:00 +0900
categories: [Next.js]
banner:
  image: https://github.com/user-attachments/assets/c4dcdb73-52ba-454e-8e64-79563874e6be
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Next.js]
---

### 쇼핑몰의 단점, 많은 이미지

![Feb-11-2025 22-45-31](https://github.com/user-attachments/assets/3eeaa972-9ada-49cb-bd64-449c06c3fe35)

가장 유명한 쇼핑몰인 쿠팡에서도 화면을 불러오는 데 2초 이상 걸리기도 합니다.
쇼핑몰은 데이터도, 이미지도 많아 화면을 로딩하는 과정에서 유저의 이탈률이 많이 생긴다고 합니다.
이를 개선하기 위해 lazy-loading을 [next/image](https://nextjs.org/docs/pages/api-reference/components/image#fill)에서 기본 제공을 하고 있다는 것을 알 수 있었습니다. 이를 이용해서 화면에 보이지 않는 이미지를 늦게 로딩하여 최적화를 할 수 있었습니다.

그럼에도 불구하고 저희 페이지는 1.5초 이상 이미지를 표시하지 못하는 경우도 있었습니다.

이를 개선하기 위하여 blur_image를 이용하여 사용자 경험을 향상시키는 것을 선택하였습니다.

### **`get_blur_img.ts` util 추가**
  - next.js/image에서 기본으로 제공하는 기능 중 placeholder를 이용하여 blur이미지를 제공해 유저 경험을 더 향상시킬 수 있음을 알게 되었습니다. 다만 외부 storage를 사용하기 때문에 blur이미지를 따로 만들어 넣어줘야하는 문제가 있었습니다.
  - 공식문서는 이때 [plaiceholder 라이브러리](https://plaiceholder.co/docs)를 추천합니다.
  - ！ plaiceholder 라이브러리는 client환경에서 이용할 수 없기 때문에, data를 가공하는 부분이 필요합니다. 해당 컴포넌트를 사용한다면 데이터를 가공하는 service 에서 유틸을 사용해 `blurImg`를 만들어주시기 바랍니다!

![Feb-03-2025 22-24-51](https://github.com/user-attachments/assets/c4dcdb73-52ba-454e-8e64-79563874e6be)