document.addEventListener('DOMContentLoaded', () => {
    const WHATSAPP = '5563999145241';
    const MAX_CHAT_LENGTH = 500;
    const MAX_ORDER_DETAILS = 2000;
    const MAX_SERVICE_NAME = 120;

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeText(str, maxLength) {
        if (typeof str !== 'string') return '';
        return str.trim().slice(0, maxLength).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }

    function safeOpen(url) {
        if (typeof url !== 'string' || !/^https:\/\/wa\.me\/\d+/.test(url)) return;
        const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
        if (newWindow) newWindow.opener = null;
    }

    function createExternalLink(url, label, className) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = className;
        link.textContent = label;
        return link;
    }

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

    checkReveal();
    window.addEventListener('scroll', checkReveal);

    // Navbar scroll effect
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navToggle.classList.toggle('active');
            navLinks.classList.toggle('open');
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navToggle.classList.remove('active');
                navLinks.classList.remove('open');
            });
        });
    }

    // Smooth scroll for anchor links (with navbar offset)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const navHeight = navbar ? navbar.offsetHeight : 0;
                const top = targetElement.getBoundingClientRect().top + window.scrollY - navHeight - 16;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

    // Service category filter
    const categoryTabs = document.querySelectorAll('.category-tab');
    const serviceCards = document.querySelectorAll('.service-card[data-category]');

    categoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            categoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const category = tab.dataset.category;
            serviceCards.forEach(card => {
                if (category === 'all' || card.dataset.category === category) {
                    card.classList.remove('hidden-card');
                } else {
                    card.classList.add('hidden-card');
                }
            });
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
    const modalWhatsapp = document.getElementById('modal-whatsapp');
    let currentServiceName = '';

    function openCheckoutModal(serviceName, servicePrice) {
        currentServiceName = sanitizeText(serviceName, MAX_SERVICE_NAME);
        const safePrice = sanitizeText(servicePrice, 30);
        modalProductName.textContent = currentServiceName;
        modalPrice.textContent = safePrice;

        const clientDescription = chatContext.userMessages.length
            ? buildClientDescription()
            : 'Cliente clicou em CONTRATAR. Não descreveu detalhes no chat — pergunte o que precisa.';

        const waMessage = buildWhatsAppMessage({
            source: 'Botão CONTRATAR',
            serviceName: currentServiceName,
            servicePrice: safePrice,
            clientDescription
        });
        modalWhatsapp.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waMessage)}`;
        modalWhatsapp.rel = 'noopener noreferrer';

        paymentStatus.innerHTML = 'Aguardando pagamento... <span class="loader"></span>';
        paymentStatus.classList.remove('success-message');
        btnSimulate.style.display = 'block';
        btnSimulate.innerText = 'Simular Pagamento Aprovado';
        btnSimulate.disabled = false;

        modal.classList.add('active');
    }

    document.querySelectorAll('.btn-service').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const card = btn.closest('[data-service]');
            if (card?.dataset.service) {
                chatContext.service = card.dataset.service;
            }
            openCheckoutModal(btn.dataset.name, btn.dataset.price);
        });
    });

    closeModalBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    btnCopyPix.addEventListener('click', () => {
        pixCodeInput.select();
        navigator.clipboard.writeText(pixCodeInput.value).catch(() => {
            document.execCommand('copy');
        });
        const originalText = btnCopyPix.innerText;
        btnCopyPix.innerText = 'Copiado!';
        setTimeout(() => {
            btnCopyPix.innerText = originalText;
        }, 2000);
    });

    btnSimulate.addEventListener('click', () => {
        btnSimulate.innerText = 'Processando...';
        btnSimulate.disabled = true;

        setTimeout(() => {
            paymentStatus.innerHTML = '✅ Pagamento Aprovado! Agendando seu atendimento...';
            paymentStatus.classList.add('success-message');
            btnSimulate.style.display = 'none';

            setTimeout(() => {
                const clientDescription = chatContext.userMessages.length
                    ? buildClientDescription()
                    : `Cliente confirmou pagamento do serviço: ${currentServiceName}.`;

                const waUrl = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(buildWhatsAppMessage({
                    source: 'Pagamento confirmado no site',
                    serviceName: currentServiceName,
                    servicePrice: null,
                    clientDescription
                }))}`;
                safeOpen(waUrl);
                modal.classList.remove('active');
            }, 2000);
        }, 2000);
    });

    // AI Chat — Assistente conversacional
    const chatToggle = document.getElementById('ai-chat-toggle');
    const chatBox = document.getElementById('ai-chat-box');
    const closeChat = document.getElementById('close-chat');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatBodyContent = document.getElementById('chat-body-content');
    const chatInputArea = document.getElementById('chat-input-area');

    const SERVICES = {
        formatacao: {
            name: 'Formatação e Instalação de SO',
            price: 'R$ 100,00',
            keywords: ['formatar', 'formatacao', 'lento', 'lenta', 'travando', 'travado', 'virus', 'windows', 'notebook', 'reinstalar']
        },
        dashboard: {
            name: 'Dashboard & Inteligência Artificial',
            price: 'R$ 120,00',
            keywords: ['dashboard', 'painel', 'inteligencia artificial', 'inteligencia', 'power bi', 'planilha', 'grafico', 'indicadores', 'bi']
        },
        redes: {
            name: 'Redes & Cibersegurança',
            price: 'R$ 90,00',
            keywords: ['ciberseguranca', 'seguranca', 'invasor', 'firewall', 'hacker', 'proteger']
        },
        roteadores: {
            name: 'Configuração de Redes e Roteadores',
            price: 'R$ 80,00',
            keywords: ['rede', 'roteador', 'wifi', 'wi-fi', 'internet', 'sinal', 'instavel']
        },
        montagem: {
            name: 'Montagem e Manutenção de PC',
            price: 'R$ 150,00',
            keywords: ['montar', 'montagem', 'gamer', 'upgrade', 'ssd', 'memoria', 'hardware', 'peca']
        },
        suporte: {
            name: 'Suporte Remoto Urgente',
            price: 'R$ 80,00',
            keywords: ['remoto', 'urgente', 'agora', 'ajuda', 'erro', 'tela azul', 'malware']
        },
        impressora: {
            name: 'Montagem e Configuração de Impressora',
            price: 'R$ 80,00',
            keywords: ['impressora', 'imprimir', 'scanner', 'multifuncional', 'toner', 'epson', 'hp', 'canon']
        },
        office: {
            name: 'Pacote Office — Instalação e Capacitação',
            price: 'R$ 80,00',
            keywords: ['office', 'word', 'excel', 'powerpoint', 'planilha', 'documento', 'apresentacao']
        },
        sites: {
            name: 'Fazemos Sites para Você',
            price: 'a partir de R$ 2.500,00',
            keywords: ['site', 'website', 'pagina', 'landing', 'loja virtual', 'ecommerce', 'portfolio', 'web', 'dominio', 'hosting', 'criar site', 'fazer site']
        }
    };

    const TRIVIAL_WHATSAPP_MESSAGES = new Set([
        'oi', 'ola', 'olá', 'hey', 'e ai', 'eai', 'hello', 'hi',
        'bom dia', 'boa tarde', 'boa noite',
        'sim', 'nao', 'não', 'n', 'ok', 'beleza', 'claro', 'pode', 'perfeito',
        'falar no whatsapp', 'ver precos', 'ver preços', 'tenho mais duvidas', 'tenho mais dúvidas',
        'sim, quero agendar!', 'explicar melhor', 'computador', 'rede/internet', 'impressora'
    ]);

    const chatContext = {
        stage: 'start',
        service: null,
        userName: null,
        userMessages: [],
        messageCount: 0
    };

    function isTrivialForWhatsApp(text) {
        const norm = normalize(text).trim();
        if (!norm || norm.length < 2) return true;
        if (TRIVIAL_WHATSAPP_MESSAGES.has(norm)) return true;
        if (isThanks(text)) return true;
        if (isGreeting(text) && norm.length < 30) return true;
        if ((isYes(text) || isNo(text)) && norm.length < 20) return true;
        if (/^(whatsapp|falar no whats|marcar|agendar)$/.test(norm)) return true;
        return false;
    }

    function recordUserMessage(text) {
        const clean = sanitizeText(text, MAX_CHAT_LENGTH);
        if (!clean || isTrivialForWhatsApp(clean)) return;
        const last = chatContext.userMessages[chatContext.userMessages.length - 1];
        if (last === clean) return;
        chatContext.userMessages.push(clean);
    }

    function buildClientDescription() {
        if (!chatContext.userMessages.length) {
            return 'O cliente pediu contato pelo chat, mas não descreveu o problema em texto.';
        }
        const lines = chatContext.userMessages.map((msg, index) => {
            if (chatContext.userMessages.length === 1) return msg;
            return `${index + 1}. ${msg}`;
        });
        let text = lines.join('\n');
        if (text.length > 1500) {
            text = text.slice(0, 1497) + '...';
        }
        return text;
    }

    function buildWhatsAppMessage({ source, serviceName, servicePrice, clientDescription }) {
        const lines = [
            'Olá! Novo contato pelo site Profissionaliza.',
            '',
            `*Origem:* ${source}`
        ];

        if (chatContext.userName) {
            lines.push(`*Nome do cliente:* ${chatContext.userName}`);
        }
        if (serviceName) {
            const pricePart = servicePrice ? ` (${servicePrice})` : '';
            lines.push(`*Serviço de interesse:* ${serviceName}${pricePart}`);
        }

        lines.push(
            '',
            `*O que o cliente descreveu que precisa:*`,
            clientDescription,
            '',
            'Aguardo retorno para ajudar com orçamento e atendimento.'
        );

        return lines.join('\n');
    }

    function normalize(text) {
        return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function keywordMatches(norm, keyword) {
        const kw = normalize(keyword);
        if (keyword.includes(' ')) {
            return norm.includes(kw);
        }
        if (kw.length <= 4) {
            return ` ${norm} `.includes(` ${kw} `);
        }
        return norm.includes(kw);
    }

    function scoreMessageForService(norm, serviceKey) {
        return SERVICES[serviceKey].keywords.filter(kw => keywordMatches(norm, kw)).length;
    }

    function detectService(text) {
        const norm = normalize(text);
        let best = null;
        let bestScore = 0;

        for (const key of Object.keys(SERVICES)) {
            const score = scoreMessageForService(norm, key);
            if (score > bestScore) {
                bestScore = score;
                best = key;
            }
        }

        return bestScore > 0 ? best : null;
    }

    function updateDetectedService(userMsg) {
        const norm = normalize(userMsg);
        const detected = detectService(userMsg);
        if (!detected) return;

        const newScore = scoreMessageForService(norm, detected);
        const currentScore = chatContext.service
            ? scoreMessageForService(norm, chatContext.service)
            : 0;

        if (!chatContext.service || newScore > currentScore) {
            chatContext.service = detected;
        }
    }

    function isGreeting(text) {
        return /^(oi|ola|bom dia|boa tarde|boa noite|hey|e ai|eai|hello|hi)\b/.test(normalize(text));
    }

    function isThanks(text) {
        return /(obrigad|valeu|agrade|thanks|brigad)/.test(normalize(text));
    }

    function isPriceQuestion(text) {
        return /(preco|quanto|custa|valor|orcamento)/.test(normalize(text));
    }

    function isYes(text) {
        return /^(sim|s|claro|pode|quero|isso|exato|perfeito|ok|beleza|bora|agendar)\b/.test(normalize(text));
    }

    function isNo(text) {
        return /^(nao|n\b|negativo|depois|talvez)/.test(normalize(text));
    }

    function extractName(text) {
        const match = text.match(/(?:me chamo|meu nome e|meu nome é|sou o|sou a)\s+([a-záàâãéèêíïóôõöúçñ\s]{2,20})/i);
        return match ? match[1].trim().split(' ')[0] : null;
    }

    function appendMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${sender}-msg`;

        if (sender === 'user') {
            msgDiv.textContent = sanitizeText(text, MAX_CHAT_LENGTH);
        } else {
            msgDiv.innerHTML = text;
        }

        chatBodyContent.appendChild(msgDiv);
        chatBodyContent.scrollTop = chatBodyContent.scrollHeight;
    }

    function showTyping() {
        const typing = document.createElement('div');
        typing.className = 'chat-msg bot-msg typing-indicator';
        typing.innerHTML = '<span></span><span></span><span></span>';
        chatBodyContent.appendChild(typing);
        chatBodyContent.scrollTop = chatBodyContent.scrollHeight;
        return typing;
    }

    function botReply(text, baseDelay) {
        const typing = showTyping();
        const delay = (baseDelay || 900) + Math.random() * 700;
        return new Promise(resolve => {
            setTimeout(() => {
                typing.remove();
                appendMessage(text, 'bot');
                resolve();
            }, delay);
        });
    }

    function addQuickReplies(options) {
        const wrap = document.createElement('div');
        wrap.className = 'chat-quick-replies';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chat-quick-btn';
            btn.textContent = opt;
            btn.addEventListener('click', () => {
                wrap.remove();
                handleUserMessage(opt);
            });
            wrap.appendChild(btn);
        });
        chatBodyContent.appendChild(wrap);
        chatBodyContent.scrollTop = chatBodyContent.scrollHeight;
    }

    function showWhatsAppButton() {
        const svc = chatContext.service ? SERVICES[chatContext.service] : null;
        const msg = buildWhatsAppMessage({
            source: 'Chat do site',
            serviceName: svc?.name || null,
            servicePrice: svc?.price || null,
            clientDescription: buildClientDescription()
        });
        const waUrl = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg bot-msg';
        msgDiv.appendChild(createExternalLink(
            waUrl,
            '💬 Continuar no WhatsApp',
            'btn btn-primary btn-glow'
        ));
        msgDiv.querySelector('a').style.cssText = 'display:block;text-align:center;padding:0.8rem;font-size:0.9rem;border-radius:8px;margin-top:6px;';
        chatBodyContent.appendChild(msgDiv);
        chatBodyContent.scrollTop = chatBodyContent.scrollHeight;
    }

    const PRICE_LIST_ITEMS = [
        { key: 'formatacao', emoji: '💿', label: 'Formatação' },
        { key: 'montagem', emoji: '🖥️', label: 'Montagem de PC' },
        { key: 'roteadores', emoji: '🌐', label: 'Redes/Roteador' },
        { key: 'redes', emoji: '🔒', label: 'Cibersegurança' },
        { key: 'suporte', emoji: '🆘', label: 'Suporte Remoto' },
        { key: 'impressora', emoji: '🖨️', label: 'Impressora' },
        { key: 'office', emoji: '📄', label: 'Pacote Office' },
        { key: 'sites', emoji: '🌐', label: 'Sites' },
        { key: 'dashboard', emoji: '🧠', label: 'Dashboard + IA' }
    ];

    function buildServicesPriceListHtml() {
        return PRICE_LIST_ITEMS.map(({ key, emoji, label }) => {
            const svc = SERVICES[key];
            return `${emoji} ${label} — <strong>${svc.price}</strong>`;
        }).join('<br>');
    }

    function servicePitch(key) {
        const svc = SERVICES[key];
        const pitches = {
            formatacao: `Pelo que você descreveu, uma <strong>${svc.name}</strong> (${svc.price}) deve resolver. Fazemos backup completo e deixamos o PC otimizado. Prefere atendimento remoto ou presencial?`,
            dashboard: `Para isso, <strong>${svc.name}</strong> (${svc.price}) é ideal — painéis com IA e dados em tempo real. É para uso pessoal ou empresarial?`,
            redes: `Recomendo <strong>${svc.name}</strong> (${svc.price}). Configuramos e protegemos sua rede. É para casa ou escritório?`,
            roteadores: `<strong>${svc.name}</strong> (${svc.price}) resolve instabilidade e sinal fraco. Quantos dispositivos usam a rede aí?`,
            montagem: `Fazemos <strong>${svc.name}</strong> (${svc.price}) com cabos organizados e testes de performance. Já tem as peças ou precisa de orientação?`,
            suporte: `<strong>${svc.name}</strong> (${svc.price}) resolve na hora, sem sair de casa. Posso te passar pro especialista agora?`,
            impressora: `<strong>${svc.name}</strong> (${svc.price}): drivers, Wi-Fi e compartilhamento entre PCs. A impressora é nova ou já usada?`,
            office: `<strong>${svc.name}</strong> (${svc.price}) — instalamos e ensinamos Word, Excel e PowerPoint na prática. É para uso pessoal ou trabalho?`,
            sites: `<strong>${svc.name}</strong> (${svc.price}) — sites modernos, responsivos e prontos para produção. Qual tipo de site você precisa: institucional, landing page ou portfólio?`
        };
        return pitches[key] || `Temos <strong>${svc.name}</strong> por ${svc.price}. Quer saber mais?`;
    }

    async function handleUserMessage(userMsg) {
        appendMessage(userMsg, 'user');
        chatContext.messageCount++;

        const name = extractName(userMsg);
        if (name) chatContext.userName = sanitizeText(name, 40);

        if (isThanks(userMsg)) {
            await botReply('Por nada! 😊 Fico feliz em ajudar. Se precisar de mais alguma coisa, é só chamar!');
            return;
        }

        if (isGreeting(userMsg) && chatContext.messageCount <= 2) {
            const hello = chatContext.userName ? `Olá, ${escapeHtml(chatContext.userName)}!` : 'Olá!';
            await botReply(`${hello} Tudo bem? Me conta qual problema técnico você está enfrentando — PC lento, rede, impressora, formatação...`);
            addQuickReplies(['PC lento/travando', 'Problema na internet', 'Configurar impressora']);
            return;
        }

        if (isPriceQuestion(userMsg) && !chatContext.service) {
            await botReply(`Claro! Nossos principais serviços:<br><br>${buildServicesPriceListHtml()}<br><br>Qual te interessa?`);
            return;
        }

        recordUserMessage(userMsg);

        updateDetectedService(userMsg);

        if (/whatsapp|falar no whats|marcar|agendar/.test(normalize(userMsg))) {
            await botReply('Perfeito! Clicando abaixo você vai direto pro WhatsApp com tudo que conversamos. 🚀');
            showWhatsAppButton();
            chatInputArea.style.display = 'none';
            chatContext.stage = 'closed';
            return;
        }

        if (chatContext.stage === 'closed') {
            await botReply('O link do WhatsApp está logo acima 😊 Ou chame pelo (63) 99914-5241.');
            return;
        }

        if (chatContext.stage === 'closing') {
            if (isYes(userMsg)) {
                await botReply('Show! Te encaminho agora pro nosso especialista. 👇');
                showWhatsAppButton();
                chatInputArea.style.display = 'none';
                chatContext.stage = 'closed';
                return;
            }
            await botReply('Sem problemas! Pode perguntar sobre prazos, pagamento ou como funciona o atendimento.');
            chatContext.stage = 'exploring';
            return;
        }

        if (chatContext.stage === 'preference') {
            if (isYes(userMsg)) {
                await botReply('Ótimo! Vou te conectar com nosso especialista no WhatsApp. 👇');
                showWhatsAppButton();
                chatInputArea.style.display = 'none';
                chatContext.stage = 'closed';
                return;
            }
            if (isNo(userMsg)) {
                await botReply('Tudo bem! Posso explicar melhor ou indicar outro serviço.');
                addQuickReplies(['Explicar melhor', 'Ver preços', 'Falar no WhatsApp']);
                chatContext.stage = 'exploring';
                return;
            }
            await botReply(`Anotei: "${escapeHtml(userMsg)}". O serviço de <strong>${escapeHtml(SERVICES[chatContext.service].name)}</strong> é a melhor escolha. Quer agendar pelo WhatsApp?`);
            addQuickReplies(['Sim, quero agendar!', 'Tenho mais dúvidas']);
            chatContext.stage = 'closing';
            return;
        }

        if (chatContext.service) {
            chatContext.stage = 'preference';
            await botReply(servicePitch(chatContext.service));
            return;
        }

        if (chatContext.stage === 'start' || chatContext.stage === 'exploring') {
            await botReply('Entendi! Para te indicar a melhor solução: é algo com <strong>computador</strong>, <strong>rede/internet</strong>, <strong>impressora</strong> ou <strong>dados/relatórios</strong>?');
            addQuickReplies(['Computador', 'Rede/Internet', 'Impressora', 'Ver preços']);
            chatContext.stage = 'exploring';
            return;
        }

        await botReply('Pode descrever com mais detalhes? Ou se preferir, falo direto com nosso técnico no WhatsApp — é rapidinho!');
        addQuickReplies(['Falar no WhatsApp', 'PC lento', 'Impressora não imprime']);
    }

    function initChatQuickReplies() {
        if (chatBodyContent.querySelector('.chat-quick-replies')) return;
        addQuickReplies(['Meu PC está lento', 'Internet caindo', 'Configurar impressora']);
    }

    chatSendBtn.addEventListener('click', () => {
        const text = sanitizeText(chatInput.value, MAX_CHAT_LENGTH);
        if (text) {
            chatInput.value = '';
            handleUserMessage(text);
        }
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') chatSendBtn.click();
    });

    chatToggle.addEventListener('click', () => {
        chatBox.classList.toggle('active');
        if (chatBox.classList.contains('active')) {
            setTimeout(initChatQuickReplies, 400);
        }
    });

    closeChat.addEventListener('click', () => {
        chatBox.classList.remove('active');
    });

    // Service card click -> scroll to form
    document.querySelectorAll('.service-card').forEach(card => {
        card.addEventListener('click', () => {
            const serviceName = card.dataset.serviceName || card.querySelector('h4').innerText.trim();
            const orderTypeSelect = document.getElementById('order-type');

            if (orderTypeSelect) {
                let matched = false;
                for (const option of orderTypeSelect.options) {
                    if (option.value === serviceName || option.text.includes(serviceName.split(' ')[0])) {
                        orderTypeSelect.value = option.value;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    orderTypeSelect.value = 'Outro';
                }

                const formSection = document.getElementById('orcamento');
                if (formSection) {
                    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }

                const detailsTextarea = document.getElementById('order-details');
                if (detailsTextarea) {
                    setTimeout(() => {
                        detailsTextarea.focus();
                        detailsTextarea.placeholder = `Descreva os detalhes para: ${sanitizeText(serviceName, MAX_SERVICE_NAME)}...`;
                    }, 800);
                }
            }
        });
    });

    // Custom Order Form
    const orderForm = document.getElementById('custom-order-form');
    if (orderForm) {
        orderForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const orderType = sanitizeText(document.getElementById('order-type').value, MAX_SERVICE_NAME);
            const orderDetails = sanitizeText(document.getElementById('order-details').value, MAX_ORDER_DETAILS);

            if (!orderType || !orderDetails) return;

            const message = buildWhatsAppMessage({
                source: 'Formulário de orçamento',
                serviceName: orderType,
                servicePrice: null,
                clientDescription: orderDetails
            });
            const waUrl = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;

            safeOpen(waUrl);
            orderForm.reset();
        });
    }
});
