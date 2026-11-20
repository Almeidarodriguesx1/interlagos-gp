# Parte 3 — timbre de referência, pisos, marchas e frenagem

## Como testar

Extraia o ZIP em uma pasta nova, entre nela pelo Terminal e execute npm ci e npm run dev. Use a porta exibida pelo novo servidor. Não reutilize uma aba que ainda aponta para a versão anterior.

1. Inicie a corrida; acelere e solte o acelerador. A afinação do loop gravado agora fica entre 0,96 e 1,04 da original, em vez de 0,72–1,37. O timbre permanece próximo do botão de teste.
2. Alterne cockpit/T-Cam e câmeras externas. O cockpit mantém agudos do motor (filtro 16 kHz, anteriormente 4,5 kHz). A câmera externa usa atenuação pela distância e filtragem gradual. Não foi adicionado reverb sintetizado.
3. Observe as marchas automáticas: há transiente mecânico gravado, breve queda de ganho e pequeno blip de reprodução na redução. A afinação principal segue variando suavemente.
4. Freie em movimento: a camada de pneus reage a freio/escorregamento, velocidade e contato no asfalto. Não é uma gravação de disco de carbono; não há som de frenagem com o carro parado.
5. Passe na zebra. O efeito é por roda, lateralizado, com intensidade e taxa de reprodução variáveis. A fonte ainda é a gravação rodoviária provisória documentada anteriormente.
6. Em Pausa > Áudio, escolha Motor, Asfalto, Zebra, Grama, Brita, Pneus/frenagem, Subida/Redução de marcha ou Frenagem na brita. Marque/desmarque Perspectiva cockpit (teste) e clique Ativar / testar áudio. O teste usa os barramentos e filtros da corrida, respeitando seus volumes e o mudo.

## O que explica a diferença que você ouviu

Na versão anterior, o teste reproduzia a amostra na afinação original diretamente no master. Na corrida, havia mudança muito maior de playbackRate e filtro forte no cockpit. Agora o motor de referência passa pelo mesmo barramento, filtro e posicionamento central; em 8500 rpm/100% de acelerador a taxa é exatamente 1 e o ganho é 0,45 nos dois caminhos. Essa rotação é apenas âncora artística da simulação: não é RPM certificado da captação.

## Superfícies e traçado

Você escolheu preservar o traçado e testar grama/brita no menu. Não foram criadas zonas fictícias nem afastados muros. Consequentemente, áreas de brita/grama não alcançáveis continuam sem acesso durante a corrida. As amostras estão prontas para uso em futuros contatos configurados no mapa. Frenagem na brita dispara apenas quando há um contato real classificado como gravel; não dispara em escape asfaltado.

Terra e água continuam sem amostras específicas. Não foram preenchidas com síntese ou com sons de brita falsamente rotulados. O motor continua gravado e provisório de automóvel genérico, não V6 F1 2026. engineReady permanece false e enginePlayable true.

## Novas fontes — gravações reais e foley

Todas sob CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

- RutgerMuller, Tires Squeaking.aif — gravação de pneus na rua; fonte para tire_screech e feedback de frenagem: https://freesound.org/people/RutgerMuller/sounds/104026/
- Allan Legemaate (alegemaate), Rustling Grass — foley real de vegetação, não pneus de F1: https://freesound.org/people/alegemaate/sounds/364712/
- UnplugTheFridge, Gear Shift - Park Reverse Drive - Interior Honda — manipulação do seletor, não transmissão F1: https://freesound.org/people/UnplugTheFridge/sounds/529222/
- kyles, auto car or van stop brake skid gravel short — parada/derrapagem sobre cascalho: https://freesound.org/people/kyles/sounds/637161/

Foram usadas prévias públicas MP3, convertidas/filtradas e editadas em WAV mono 48kHz/16bit. Não são masters de captação. Os loops receberam crossfade. Os efeitos de marcha usam o mesmo transiente mecânico em cortes de 250/300 ms. Não há áudio gerado por IA, osciladores ou ruído sintetizado. Motor qubodup e demais fontes anteriores mantêm os créditos em public/audio/CREDITS.txt.

## Validação

- TypeScript, 36 testes, build de produção e check:geom passaram.
- Renderização offline no Chrome com Web Audio real e os arquivos entregues: botão de motor e cockpit em condição de referência com diferença de nível menor que 0,001 dB; sinal na externa, zebra, frenagem, nas oito amostras de efeitos e silêncio no mudo.
- Memória decodificada observada no ensaio: 4.880.608 bytes. Não equivale ao consumo total do jogo.
- O ensaio é medição técnica, não aprovação auditiva dos seus fones/alto-falantes. Inclui condições controladas, não uma volta jogada. Resultado em validacao-audio-parte3.json; ensaio reproduzível em audio-check.html através do Vite.
- O build ainda avisa sobre bundle acima de 500 kB e futura mudança de carregamento do Vite; não impede compilar.

Este documento descreve a versão mais recente. Os documentos Parte 1 e Parte 2 registram entregas anteriores.
