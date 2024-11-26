---
title: 쏙쏙 들어오는 함수형 코딩 [CHAPTER 7, 8, 9]
author: haeran
date: 2024-11-26 21:07:00 +0900
categories: [Study, Book, 쏙쏙 들어오는 함수형 코딩]
tags: [Book, 쏙쏙 들어오는 함수형 코딩]
---


### CHAPTER 7. 신뢰할 수 없는 코드를 쓰면서 불변성 지키기

- **카피-온-라이트와 방어적 복사**
    - 카피 온 라이트는 불변성이 확보된 안전지대 안에서 데이터를 주고받는다면, 방어적 복사는 신뢰할 수 없는 코드와 데이터를 주고받을 때 복사본을 만들어 전달 혹은 사용합니다. 이때 방어적 복사는 깊은 복사를 하여 모든 것을 복사하기 때문에, 카피 온 라이트에 비해 비용이 많이 든다는 단점이 있습니다.
    - 웹 기반 API도 암묵적으로 방어적 복사를 하게 됩니다. request, response 를 주고받을때 JSON 형식으로 직렬화하여 데이터를 전송하는 것도 방어적 복사로 데이터를 복사해서 복사본을 전달하는 방식을 사용합니다.
        
        
        | **주제** | **카피 온 라이트** | **방어적 복사** |
        | --- | --- | --- |
        | **언제?** | 통제할 수 있는 데이터를 바꿀 때 | 신뢰 할 수 없는 코드와 데이터를 주고 받을 때 |
        | **어디서?** | 안전지대 어디서나 사용 | 안전지대의 경계에서 데이터가 오고 갈 때 |
        | **복사 방식** | 얕은 복사 | 깊은 복사 |
        | **규칙** | 1. 바꿀 데이터의 복사본을 생성
        2. 복사본 변경
        3. 복사본 리턴 | 1. 안전지대로 들어오는 데이터를 깊은 복사
        2. 안전지대를 나가는 데이터에 깊은 복사 |
- 얕은 복사와 깊은 복사
    - 얕은 복사 : 객체의 참조값(주소 값)을 복사 → 복사된 객체를 수정하면 기존 객체를 저장한 변수에 영향
        - 객체 안에 객체가 있을 경우, 한 개의 객체라도 기존 변수 객체를 참조하고 있다면 얕은 복사
        - 대표적인 예 : `Array.slice()` → start, end를 설정하지 않는다면, 기존 배열 전체를 얕은 복사
    - 깊은 복사 : 객체의 실제 값을 복사 → 복사된 객체를 수정하여도 기존 원시값을 저장한 변수에 영향이 없다
        - 원본과 참조가 완전히 끊어진 객체
        - 대표적인 예 : `JSON.stringify` → 객체를 json 문자열로 변환하는 과정에서 원본 객체와의 참조가 모두 끊어짐

### CHAPTER 8. 계층형 설계 I

- 계층형 설계란?
    - 소프트웨어를 계층으로 구성하는 기술을 말합니다.
    - 비즈니스 규칙, 동작들, 카피-온-라이트, 배열 관련 기능등 목적에 따라 계층으로 나누어 구성합니다.
    
    ![image.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/1e33c9be-7fc7-4d9b-bd09-cde89805af4c/964a6da4-479f-4fe7-8595-87ad6d3bc385/image.png)
    
- 계층형 설계 패턴 1 - 직접 구현
    - 직접 구현이란 : 함수가 더 구체적인 내용을 다루지 않도록 함수를 일반적인 함수로 빼내는 것
    
    ```jsx
    function freeTieClip(cart) {
    	var hasTie = false;
    	var hasTieClip = false;
    	for (var i = 0; i < cart.length; i++) {
    		var item = cart[i];
    		if (item.name === 'tie') hasTie = true;
    		if (item.name === 'tie clip') hasTieClip = true;
    	}
    
    	if (hasTie && !hasTieClip) {
    		var tieClip = make_item('tie clip', 0);
    		return add_item(cart, tieClip);
    	}
    	return cart;
    }
    ```
    
    - 문제점
        - 너무 구체적이기 때문에 직접 구현 패턴을 따르지 않고 있음
        - 장바구니가 배열이라는 사실을 알 필요가 없음
        - array index, for loop는 언어 기능이고, make_item, add_item은 함수를 호출하기 때문에 **서로 다른 계층임**
    - 개선
        
        ```jsx
        function freeTieClip(cart) {
            var hasTie = isInCart(cart, 'tie');
            var hasTieClip = isInCart(cart, 'tie clip');
            if (hasTie && !hasTieClip) {
        		var tieClip = make_item('tie clip', 0);
        		return add_item(cart, tieClip);
        	}
        	return cart;
        }
        
        function isInCart(cart, name) {
        	for (var i = 0; i < cart.length; i++) {
        		if (cart[i].name === name) return true;
        	}
        	return false;
        }
        ```
        
        - isInCart 함수를 만들어 공통으로 사용함
        - freeTieClip 함수는 장바구니가 배열인지 몰라도됨 => 함수가 모두 비슷한 계층에 있다는 것을 의미함
        - 함수가 모두 비슷한 계층에 있기 때문에 직접 구현

### CHAPTER 8. 계층형 설계 II

- 계층형 설계 패턴 2 - 추상화의 벽
    
    ![image.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/1e33c9be-7fc7-4d9b-bd09-cde89805af4c/8b316645-b999-40a6-a49d-46c46a5a2555/image.png)
    
    - 추상화의 벽을 통하여 책임을 명확하게 나눔
    - 세부 표현을 감춘 함수로 이루어진 계층으로 사용할 때 구현을 전혀 몰라도 된다
    - 사용하는 경우
        - 쉽게 구현을 바꾸기 위하여
        - 코드를 읽고 쓰기 쉽게 만들기 위하여 (유지보수성 및 가독성)
        - 주어진 문제에 집중하기 위하여
- 계층형 설계 패턴 3 - 작은 인터페이스
    - 인터페이스를 최소화하여 하위 계층에 불필요한 기능이 쓸데없이 커지는 것을 막을 수 있다.
    - 이상적인 계층은 더도 덜도 아닌 필요한 함수만 가지고 있어야 한다.
    
- 계층형 설계 패턴 4 - 편리한 계층
    - 다른 패턴과 다르게 조금 더 현실적이고 실용적인 측면을 가진 계층
    - 계층이 크고, 위의 패턴들이 잘 지켜지지 않더라도 현재 작업하는 코드가 편리하다고 느낀다면 설계를 조금 멈춰도 괜찮다. 반복문을 감싸지 않고 그대로 두고, 호출 화살표가 조금 길어지거나 계층이 다른 계층과 섞여도 그대로 두어도 괜찮다.
    - 언제나 설계와 새로운 기능의 필요성 사이 어느 지점에 머물게 된다. 개발자로서의 필요성과 비즈니스 요구사항 모두를 만족시켜야한다.