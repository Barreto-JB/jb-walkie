# JB Walkie — Voice by NFC

Aplicação web de walkie-talkie privada de duas pessoas. Ao abrir o mesmo link, o primeiro participante é anfitrião e o segundo entra como convidado. A voz é transmitida por WebRTC (PeerJS), com serviço gratuito de sinalização PeerJS Cloud. A app configura STUN e as credenciais temporárias TURN do serviço público Open Relay, cuja disponibilidade não é garantida.

## Funcionalidades

- HTTPS por GitHub Pages, instalável como PWA.
- Salas aleatórias de 96 bits; não necessita de contas ou números de telefone.
- Microfone autorizado por cada participante.
- Premir para falar ou modo alternar, nomes, estado e cronómetro.
- Convite por URL, partilha nativa ou QR Code; NFC apenas transmite o URL.
- Limite atual: **duas pessoas**.

## Testar

1. Abre a página HTTPS e clica "Criar ligação".
2. Autoriza o microfone.
3. Partilha o link a alguém, de preferência noutro tipo de rede.
4. A outra pessoa abre o link, autoriza o microfone e aguarda a ligação.
5. Mantém premido o botão FALAR e alterna os turnos.

## Privacidade e limitações

- O link é a chave da sala. Não o publiques, pois não existe autenticação de utilizadores. O áudio usa DTLS-SRTP via WebRTC.
- A sinalização PeerJS é um serviço público gratuito. A aplicação tenta usar o TURN público Open Relay, mas o teste forçando apenas TURN em 22/11/2026 **não obteve candidatos relay**; não se garante ligação em redes restritivas. Um serviço TURN autenticado próprio seria necessário para fiabilidade superior. Este projeto não oferece SLA nem 100% de disponibilidade.
- Alguns navegadores móveis suspendem microfone/áudio com o ecrã bloqueado. Mantém o ecrã ligado.
- A página não recolhe números, emails ou transcrições; o nome escolhido fica apenas no armazenamento local do navegador.
- NFC entre dois telemóveis requer leitor compatível com o tipo de emulação, pelo que QR e link são alternativas.

## Créditos

PeerJS, qrcodejs. Projeto pessoal experimental de João Barreto.
