document.addEventListener('DOMContentLoaded', () => {
    // Scroll Reveal Animation
    const reveals = document.querySelectorAll('.reveal');

    function checkReveal() {
        const windowHeight = window.innerHeight;
        const revealPoint = 50;

        reveals.forEach(reveal => {
            const revealTop = reveal.getBoundingClientRect().top;
            if (revealTop < windowHeight - revealPoint) {
                reveal.classList.add('active');
            }
        });
    }

    // Initial check on load
    checkReveal();
    
    // Check on scroll
    window.addEventListener('scroll', checkReveal);

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Modal Logic
    const modal = document.getElementById('checkout-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    const btnSimulate = document.getElementById('simulate-payment');
    const paymentStatus = document.getElementById('payment-status');
    const modalProductName = document.getElementById('modal-product-name');
    const modalPrice = document.getElementById('modal-price');
    const btnCopyPix = document.getElementById('btn-copy-pix');
    const pixCodeInput = document.getElementById('pix-code');

    // Open Modal
    document.querySelectorAll('.price-action .btn, .hero-buttons .btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.getAttribute('href') !== '#produtos') {
                e.preventDefault();
                let productCard = btn.closest('.product-info');
                
                if (productCard) {
                    const productName = productCard.querySelector('h3').innerText;
                    const productPrice = productCard.querySelector('.price').innerText;
                    modalProductName.innerText = productName;
                    modalPrice.innerText = productPrice;
                } else {
                    // Fallback for hero CTA or others
                    modalProductName.innerText = 'Pacote Completo de Templates';
                    modalPrice.innerText = 'R$ 44,90';
                }
                
                // Reset modal state
                paymentStatus.innerHTML = 'Aguardando pagamento... <span class="loader"></span>';
                paymentStatus.classList.remove('success-message');
                btnSimulate.style.display = 'block';
                btnSimulate.innerText = 'Simular Pagamento Aprovado';
                btnSimulate.disabled = false;

                modal.classList.add('active');
            }
        });
    });

    // Close Modal
    closeModalBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    // Copy Pix
    btnCopyPix.addEventListener('click', () => {
        pixCodeInput.select();
        document.execCommand('copy');
        const originalText = btnCopyPix.innerText;
        btnCopyPix.innerText = 'Copiado!';
        setTimeout(() => {
            btnCopyPix.innerText = originalText;
        }, 2000);
    });

    // Simulate Payment
    btnSimulate.addEventListener('click', () => {
        btnSimulate.innerText = 'Processando...';
        btnSimulate.disabled = true;
        
        setTimeout(() => {
            paymentStatus.innerHTML = '✅ Pagamento Aprovado! Fazendo download...';
            paymentStatus.classList.add('success-message');
            btnSimulate.style.display = 'none';
            // Simulate download action (Real functional download on Mobile/Desktop)
            setTimeout(() => {
                const textContent = `====== RECIBO DE COMPRA E TEMPLATE ======\n\nObrigado por adquirir nossos materiais!\nEste é o arquivo raiz do produto: ${modalProductName.innerText}\n\nNota: Este arquivo foi gerado automaticamente para testes.`;
                const blob = new Blob([textContent], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `meu_${modalProductName.innerText.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
                
                document.body.appendChild(a);
                a.click();
                
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                modal.classList.remove('active');
            }, 2000);
        }, 2000);
    });

    // AI Chat Widget Logic
    const chatToggle = document.getElementById('ai-chat-toggle');
    const chatBox = document.getElementById('ai-chat-box');
    const closeChat = document.getElementById('close-chat');
    
    // Dynamic Chat Elements
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatBodyContent = document.getElementById('chat-body-content');
    const chatInputArea = document.getElementById('chat-input-area');
    
    let chatStep = 0;

    function appendMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${sender}-msg`;
        msgDiv.innerHTML = text;
        chatBodyContent.appendChild(msgDiv);
        chatBodyContent.scrollTop = chatBodyContent.scrollHeight;
    }

    function processChat(userMsg) {
        if(chatStep === 0) {
            setTimeout(() => {
                appendMessage(`Entendi! Um template para <strong>${userMsg}</strong> seria perfeito para aumentar seus resultados. Você já tem conteúdo pronto ou vai começar do zero?`, 'bot');
            }, 800);
            chatStep++;
        } else if (chatStep === 1) {
            setTimeout(() => {
                appendMessage("Ótimo! Nós temos a solução exata para isso. Como cada projeto tem suas particularidades, por favor, clique no botão abaixo para o nosso especialista te enviar a melhor oferta no WhatsApp agora mesmo!", 'bot');
                
                // Show WhatsApp Button
                setTimeout(() => {
                    const whatsBtn = `<a href="https://wa.me/5563999145241?text=Ol%C3%A1%2C%20estou%20buscando%20um%20template%20para%20${encodeURIComponent(userMsg)}!" target="_blank" class="btn btn-primary btn-glow" style="display:block; text-align:center; padding:0.8rem; font-size:0.9rem; border-radius:8px; margin-top:10px;">Falar com Especialista no WhatsApp</a>`;
                    appendMessage(whatsBtn, 'bot');
                    // Hide input area after checkout redirect shown
                    chatInputArea.style.display = 'none';
                }, 800);
            }, 1200);
        }
    }

    chatSendBtn.addEventListener('click', () => {
        const text = chatInput.value.trim();
        if(text) {
            appendMessage(text, 'user');
            chatInput.value = '';
            processChat(text);
        }
    });

    chatInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') {
            chatSendBtn.click();
        }
    });

    chatToggle.addEventListener('click', () => {
        chatBox.classList.toggle('active');
    });

    closeChat.addEventListener('click', () => {
        chatBox.classList.remove('active');
    });

    // Custom Order / AI Generator Logic
    const orderForm = document.getElementById('custom-order-form');
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const orderType = document.getElementById('order-type').value;
            const orderDetails = document.getElementById('order-details').value;
            
            const submitBtn = orderForm.querySelector('button[type="submit"]');
            
            const message = `Olá! Gostaria de um *Projeto Personalizado*.\n\n*Tipo:* ${orderType}\n*Detalhes do que eu preciso:* ${orderDetails}\n\nPodemos conversar sobre valores e prazos?`;
            const waUrl = `https://wa.me/5563999145241?text=${encodeURIComponent(message)}`;
            
            window.open(waUrl, '_blank');
            orderForm.reset();
        });
    }
});
