# Parte 5 — áudio, partida, câmbio e ladeiras

Esta é a primeira entrega da Parte 5 do plano aprovado. Ela não conclui toda a auditoria nem a fase visual/Blender. A Parte 4 foi usada como base. O ZIP anterior permanece disponível.

## Executar e testar

Extraia o ZIP numa pasta nova. No Terminal dessa pasta: `npm ci`, depois `npm run dev`. Abra a URL indicada pelo novo servidor; uma versão antiga pode ocupar outra porta. Para servir o build: `npm run preview`; não abrir dist/index.html diretamente.

Na tela inicial há opções **Começar com motor desligado** e **Câmbio manual**. Você pode deixar o motor desligado durante a largada. A partida é uma interação de jogo simplificada, não o procedimento real de uma equipe de F1.

- **I** liga/desliga. Após ligar há 0,7 s antes de produzir tração. Não foi acrescentado um som artificial de arranque; falta uma gravação específica desse mecanismo.
- **T** alterna manual/automático durante a sessão.
- **E** sobe e **Q** reduz uma marcha. No manual não há trocas automáticas; o jogador precisa trocar para evitar ficar no corte. Reduzir para N ou R exige quase parado. Há bloqueio de redução que excederia o limite de RPM. Em R manual, acelerador move para trás e freio segura; o modo automático conserva o atalho antigo de freio para ré.
- Pausa > Motor e transmissão também permite escolher manual e solicitar partida/desligamento. Pedidos de motor/marcha feitos pausado são aplicados ao continuar, mantendo a física congelada.
- Câmeras **1–5**, acelerador/freio/direção e demais comandos anteriores continuam disponíveis. Os novos comandos I/T/Q/E são de teclado/menu; não há novo mapeamento para volante/gamepad nesta parte.

## Áudio

Com sua autorização explícita nesta conversa, o arquivo verstappen_onboard.wav foi analisado (99,9935 s, estéreo PCM16/48 kHz) e recebeu um recorte experimental em 75,25–76,20 s, mono com crossfade e filtros. O original não foi modificado. Só o recorte foi incluído no jogo, não a gravação inteira.

O novo motor usa seu onboard por padrão. No menu é possível comparar **Seu onboard (experimental)** com **Motor anterior**. Não foram atribuídos RPM nativos nem certificado o ano/origem do onboard. A reprodução varia de 0,8–1,12, com pequenas respostas nas marchas; 10500 rpm é apenas âncora artística da simulação. O recorte foi escolhido com inspeção espectral, sem aprovação auditiva humana: escute se há rádio, mudança de marcha no loop ou repetição incômoda. O banco definitivo de cinco faixas e desaceleração continua pendente. `engineReady=false` permanece correto; `enginePlayable=true` e `engineMode=recorded-onboard-experimental` indicam reprodução disponível.

Adversários agora utilizam a gravação disponível sem depender do banco definitivo aprovado. Os três mais próximos, num raio de 150 m, recebem atenuação por distância, panorama relativo à câmera, filtragem e Doppler com velocidade da fonte/ouvinte. As vozes gravadas são preparadas no carregamento e seus buffers são compartilhados. Não é uma gravação externa real de passagem: é adaptação do onboard à posição do adversário. Na externa, escute os carros se aproximando/passando; no cockpit, ficam mais discretos. O controle **Adversários / passagem** atua separadamente do seu motor.

A chuva ambiente é gravação real de InspectorJ, extraída de prévia pública MP3 e editada para um loop de aproximadamente 12 s. Fonte: https://freesound.org/people/InspectorJ/sounds/321173/ — CC BY 4.0: https://creativecommons.org/licenses/by/4.0/. Não é master sem perdas. **Chuva** tem volume separado e toca no molhado mesmo parado e com motor desligado. Pausa e mudo silenciam a corrida. Ainda faltam gravações próprias para água sob os pneus, poças e spray: não foram substituídas por chuva falsamente rotulada como pneu.

No menu, **Ativar / testar áudio** monitora os loops por cinco segundos, permitindo ouvir ajustes de volume ao mover os controles. **Parar teste** encerra o monitor. Selecione Passagem de adversário (prévia) para ouvir uma passagem ilustrativa e ajustar o volume dessa categoria. Marchas continuam transientes curtos de uma reprodução. Zero silencia a categoria. Os controles usam ganho quadrático e rampas suaves. A opção de fonte do motor vale para a instância atual; escolha de transmissão alterada pelo T/menu também vale para a sessão, enquanto as preferências da tela inicial são salvas pelo mecanismo existente.

**Zebra preservada:** WAV, ganho, taxa, panorama por contato e regras de superfície da corrida permanecem os da Parte 4. Traçado, muros e zonas de escape não foram alterados. Nenhum sintetizador foi ativado.

## Física e sessão

A gravidade longitudinal passa a considerar a orientação do carro no declive, e a componente lateral recebe a projeção correspondente. Virar o carro 180° inverte o sinal no referencial do carro, preservando a direção de descida no mundo. Há resistência estática para evitar oscilação perto de velocidade zero e retenção com freio em baixa velocidade. O relevo não foi redesenhado, a gravidade não foi aumentada artisticamente e ainda não existe dinâmica vertical completa de suspensão/saltos.

A IA recebeu espaçamento mais conservador e maior deslocamento de ultrapassagem para manter o teste de tráfego estável após essa alteração. A física continua a 180 Hz. Curvatura da IA, elipse de aderência e calibração de frenagem da auditoria ficam para a próxima parte de física; não foram alteradas escondidamente junto do som de zebra aprovado.

Pausa preserva a fase anterior, inclusive antes da primeira luz. Demonstração da tela inicial não cria novos recordes do jogador. Troca de clima limpa melhores tempos da sessão, seleciona recorde/ghost da nova condição e invalida a volta em curso para tempo; a próxima volta completa pode valer. Não apagamos recordes legados já gravados no navegador.

## Validação

- TypeScript, suíte de 49 testes, build de produção e check:geom.
- Novos testes: ignição, atraso de partida, manual, redução perigosa, seleção de N/R, gravidade nas duas orientações, freio em declive, pausa da largada, demonstração e mudança de clima.
- Web Audio real no Chrome/OfflineAudioContext: motor e teste com mesmo sinal em condição de referência; motor desligado silencioso; chuva parada; adversário próximo mais forte que distante e com canal correto; controles em zero e mudo silenciosos. Memória dos buffers: 7.347.808 bytes em 48 kHz. Não equivale ao consumo total nem ao pico de decodificação.
- Resultado em validacao-audio-parte5.json; ensaio reproduzível em /audio-parte5-check.html via Vite. /audio-check.html mantém comparação com o motor genérico anterior.
- Interface real no Chrome: desligamento por I, manual, subida de marcha e controles de chuva/adversários, sem exceções JavaScript; resultado em validacao-ui-parte5.json.
- Renderização por software ainda ficou perto de 4 FPS, com descarte de tempo físico. Não representa benchmark da GPU do seu Mac. O build mantém os avisos de bundle grande e configuração futura do Vite.

## Próximas entregas do plano

Calibração da curvatura/aderência/frenagem, benchmarks de volta por era e condições, validação de pista por trecho e kit/modelo piloto no Blender. O grid visual não foi substituído. Obter cortes melhores de motor e gravações de água/spray continua trabalho de produção e escuta, sem síntese automática.
