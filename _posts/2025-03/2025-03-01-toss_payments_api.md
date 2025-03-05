---
layout: post
title: Toss Payments 연동하면서 만난 이슈들
author: haeran
date: 2025-03-01 21:07:00 +0900
categories: [Study]
banner:
  image: https://github.com/user-attachments/assets/866deea5-dbc5-4194-8c0b-c771f2f319e6
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [TossAPI]
---

## **Toss payments에 대하여** 

Toss Payments는 PG(결제 대행) 서비스로, 사용자가 결제를 시도하면 이를 중개하여 결제 처리 후 결과를 반환하는 역할을 합니다. Toss Payments는 RESTful API 방식으로 운영되며, application/json을 기본으로 사용합니다.

### **Toss Payments의 특징**

1. **간단한 연동**: REST API 기반으로 쉽고 빠르게 연동 가능
2. **다양한 결제 수단 지원**: 카드, 계좌이체, 간편결제 등 다양한 결제 옵션 제공
3. **보안 강화**: 암호화 및 보안 인증 적용
4. **실시간 결제 상태 확인**: 웹훅(Webhook) 지원으로 실시간 상태 업데이트 가능

### **Toss Payments의 결제 흐름**

![toss](https://github.com/user-attachments/assets/a5d9bd4e-6121-40ad-84ac-d80d457b64eb)

연동에 대해서는 [공식문서](https://docs.tosspayments.com/guides/v2/payment-widget/integration)에 자세히 잘 나와있지만, 실제 연동을 하다보니 만난 문제들이 있어 블로그로 정리하려고 합니다.

## toss payment - AlreadyWidgetRenderedError: 이미 위젯이 렌더링되어 있습니다. 다시 렌더링하려면 cleanup 을 먼저 호출해주세요

![toss-truble1](https://github.com/user-attachments/assets/b882dc39-746d-449b-88ae-b863eb670b16)

### **원인**

금액을 바꿀때마다 `widgets`이 갱신되어 결제 ui를 여러번 렌더링 하는 문제가 발생하였습니다. 결제 금액이 달라졌기 때문에 위젯은 갱신 되어야하는 것이 맞았고, 기존 위젯을 삭제해야하는 문제였습니다.

### **해결**

먼저 금액을 바꾸는 이벤트에 debounce를 줘 위젯을 갱신하는 이벤트를 최소화하였습니다.

```tsx

const debouncedPrice = useDebounce(price, 500)

useEffect(() => {
  setAmount({
    currency: "KRW",
    value: extractNumber(debouncedPrice ?? ""),
  })
}, [debouncedPrice])
```

두번째로 새로운 위젯이 생성되기 전 기존 위젯을 삭제하는 로직을 추가하였습니다.

useEffect가 실행될 때 위젯을 한번 제거해준 후, 그래도 에러가 난다면 catch에서 위젯을 확인한 후 제거해주는 로직으로 문제를 해결하였습니다.

```tsx
useEffect(() => {
  async function renderPaymentWidgets() {
    if (widgets == null) {
      return
    }

    try {
      setReady(false)

      await renderUi?.destroy()
      await agreementUi?.destroy()

      await widgets.setAmount(amount)

      const newUi = await widgets.renderPaymentMethods({
        selector: "#payment-method",
        variantKey: "DEFAULT",
      })

      setRenderUi(newUi)

      const newAgreement = await widgets.renderAgreement({
        selector: "#agreement",
        variantKey: "AGREEMENT",
      })

      setAgreementUi(newAgreement)
    } catch (error) {
      if (renderUi) {
        renderUi.destroy()
        setRenderUi(null)
      }
      if (agreementUi) {
        agreementUi.destroy()
        setAgreementUi(null)
      }
      setReady(false)
    }
    setReady(true)
  }

  renderPaymentWidgets()

  return () => {
    if (renderUi) {
      renderUi.destroy().then(() => setRenderUi(null))
    }
    if (agreementUi) {
      agreementUi.destroy().then(() => setAgreementUi(null))
    }
  }
}, [widgets, amount])
```

## oss에서 redirect를 해주는 경우 cookie에 값이 없는 상태로 넘어오기 때문에 middleware에서 엣지 케이스 처리

토스에서 결제가 완료 된 후 클라이언트로 리다이렉트 되는 과정에서 계속해서 메인 화면으로 이동하는 문제가 발생하였습니다.

### **원인**

next/middleware를 통해 jwt token이 없는 유저의 경우 로그인 화면으로 이동시키고 있었는데, 토스 클라이언트에서 리다이렉트 해오는 과정에서 jwt token이 server로 넘어오지 않는 문제였습니다. 당연히 저희 클라이언트에서 보내는 요청이 아니기 때문에 토큰이 담기지 않는 것이었죵…

### **해결**

미들웨어에서 토스에서 결과값을 받아오는 두가지 페이지만 엣지케이스로 등록하는 방법을 선택하였습니다.

```tsx
  if (pathname === "/pay/toss/success" || pathname === "/pay/toss/fail") {
    return NextResponse.next()
  }
```
