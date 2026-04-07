require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve os arquivos do diretório atual (HTML, CSS, JS) como arquivos estáticos para que o site continue funcionando.
app.use(express.static(__dirname));

// Inicializando a API do Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/generate', async (req, res) => {
    try {
        const { orderType, orderDetails } = req.body;
        
        // Selecionar o modelo estável
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Engenharia de Prompt (As instruções para a IA)
        let prompt = `Você é um desenvolvedor de software/designer experiente trabalhando em uma fábrica de templates rápidos.
O cliente solicitou um projeto do tipo: "${orderType}".
Os detalhes solicitados pelo cliente foram: "${orderDetails}".

Instruções:
- Se o projeto for um "Site", gere o código HTML e CSS completo, moderno, em um único arquivo, pronto para uso.
- Se for um "Currículo", crie um template limpo e estiloso (preferencialmente já usando HTML simples ou Markdown estruturado).
- Se for uma "Planilha", entregue o conteúdo formatado como um arquivo CSV delimitado por vírgulas válido.
Responda APENAS com o código, sem textos introdutórios ou de ajuda do tipo 'Aqui está o seu site'. Remova marcações de blocos de código (ex: \`\`\`html) do retorno para que o código vá limpo.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const textCodeOutput = response.text();

        let filename = 'template.txt';
        let mimeType = 'text/plain';

        if (orderType.toLowerCase().includes('site')) {
            filename = 'website-personalizado.html';
            mimeType = 'text/html';
        } else if (orderType.toLowerCase().includes('currículo')) {
            filename = 'curriculo.html';
            mimeType = 'text/html';
        } else if (orderType.toLowerCase().includes('planilha') || orderType.toLowerCase().includes('financeiro')) {
            filename = 'controle-financeiro.csv';
            mimeType = 'text/csv';
        }

        res.json({
            success: true,
            filename: filename,
            mimeType: mimeType,
            content: textCodeOutput
        });

    } catch (error) {
        console.error("Erro ao invocar o Gemini:", error);
        res.status(500).json({ success: false, error: "Falha na geração do template pela IA." });
    }
});

app.listen(port, () => {
    console.log(`[Servidor de IA] Operando em: http://localhost:${port}`);
    console.log(`Abra esse endereço no seu navegador local para testar a automação.`);
});
