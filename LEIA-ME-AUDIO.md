# Versão atual: fase 8 — Blender integrado, motor e cenário

Leia PARTE-8-BLENDER-MOTOR-CENARIO.md primeiro. Novo .blend editável e GLB carregado no jogador, novas edições do onboard e correção de prédios/apoios. As seções seguintes são históricas.

# Versão atual: Parte 7 — cenário, colisões e carro piloto

Leia PARTE-7-CENARIO-COLISOES-CARRO.md primeiro. Público sentado, grama detalhada, colisões de cenário e dano aerodinâmico, além do carro piloto/GLB. Os 17 arquivos de áudio e os samples da pista foram preservados. As seções a seguir são históricas.

# Versão atual: Parte 6 — física e IA

Leia PARTE-6-FISICA-IA.md primeiro. Curvatura para condução, aderência compartilhada, frenagem e IA revisadas. Os 17 arquivos de áudio e a geometria foram preservados. A IA ainda tem ritmo conservador; a reprodução integral de 2026 continua pendente. Os blocos abaixo são históricos.

# Versão atual: Parte 5

Leia PARTE-5-AUDIO-CONTROLES.md primeiro: onboard autorizado, chuva, passagem de adversários, controles e partida/manual. Os blocos seguintes são históricos.

# Versão atual: Parte 4 — superfícies compartilhadas

Leia PARTE-4-SUPERFICIES.md primeiro. Física a 180 Hz, materiais unificados e variação visual da grama existente; gravações e traçado preservados.

# Versão atual: Parte 3

Consulte PARTE-3-MIXAGEM.md primeiro. Timbre do motor alinhado ao teste, efeitos gravados e seletor de amostras no menu; traçado preservado. O texto abaixo é histórico.

# Versão atual: Parte 2 — som real provisório

Consulte primeiro PARTE-2-SOM-REAL.md. Esta versão inclui um loop real de automóvel genérico; enginePlayable=true e engineReady=false são esperados. O motor não é um V6 F1 2026. As descrições anteriores abaixo documentam a base e suas pendências.

# Atualização do áudio — entrega de implementação

Esta é a versão WEB atualizada. O original permanece intacto. O projeto Godot incluído no ZIP original não foi modificado.

## Executar

Use Node.js e npm compatíveis com o Vite do projeto:

```sh
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite e inicie uma corrida. Abra Pausa para os seis controles de volume; os valores são salvos no navegador. Para produção: `npm run build`; para servir a compilação: `npm run preview`. Não abra `dist/index.html` diretamente pelo Finder.

## Implementado

- Novo `RecordedAudioEngine`, usado pelo renderer no lugar do sintetizador. Nenhum oscilador, gerador de ruído ou worklet de combustão é iniciado por esse caminho.
- Consultas de superfície em quatro pontos de roda, seguindo posição e orientação do carro; lados separados no estéreo, intensidade por velocidade e carga aproximada. Rodas elevadas acima do limite não produzem contato.
- Asfalto da pista e faixa de escape de 6,95 m, conforme a malha existente, separados da zebra e da grama externa.
- Configuração de zonas por posição normalizada na pista, lado e distância além da borda. Materiais terra e brita são suportados. O arquivo inicia vazio: o traçado recebido não comprova zonas desses materiais. Não inventei áreas reais de Interlagos.
- Loops reais de rolagem no asfalto, textura provisória de zebra e brita, com origem CC0 registrada. A brita está instalada, mas só toca quando uma zona é configurada como brita. Não toca indiscriminadamente ao sair da pista.
- Entradas independentes para terra, grama, água, derrapagem, vento, marchas, colisão e sinais da interface.
- Cinco bandas de RPM com mistura de energia normalizada, camada independente de desaceleração e validação das seis amostras antes de ativar o motor. Até três rivais utilizam essas mesmas gravações com distância, balanço e Doppler, quando disponíveis.
- Controles separados de volume geral, motor, pisos, vento, impactos e interface; transições suaves e margem na saída. Compressor de proteção, sem promessa de limitação absoluta de true peak.
- Pausa, mudo e descarte interrompem as fontes correspondentes; limite de 12 efeitos transitórios simultâneos.
- Conversão de áudio com verificação de erros, sem normalização automática de todos os arquivos e sem depender de Bun ou de encoder Vorbis.

## O que ainda depende de material ou validação

**O banco definitivo de motor continua pendente; há agora um motor gravado provisório.** Não foram fornecidas gravações licenciadas de V6 de 2026. Grama, terra, água, vento, derrapagem, marchas, impactos e sinais da interface também ficam silenciosos até seus arquivos existirem. O modo atual não repõe esses sons com síntese. Portanto esta entrega implementa a infraestrutura e os sons disponíveis, mas NÃO conclui o banco nem todos os critérios de aceitação do plano.

As três amostras de superfície instaladas são: `asphalt.wav`, `kerb_rumble.wav` e `gravel.wav`. A zebra é uma adaptação de faixa sonora rodoviária, não captação em autódromo; o cascalho foi gravado com Honda CR-V. O asfalto usa a parte inicial da mesma gravação rodoviária, com crossfade de loop e ajuste de nível. São protótipos de superfície, feitos de prévias públicas MP3. Obter masters WAV e gravações de pneus de competição continua sendo parte da produção.

Os quatro contatos são aproximações geométricas da simulação existente: não representam uma nova suspensão física independente por roda. Ainda é necessário calibrar carga, espaçamento das nervuras, velocidades nativas das amostras, posições de rodas e percepção em sessão jogável. A mistura final de motor e rivais não pôde ser aprovada sem as gravações.

A física de DRS/ERS não foi convertida para o regulamento de 2026. Não adicionei sons fictícios para representar aerodinâmica ativa. A versão Godot precisa de sua implementação separada.

## Adicionar as gravações que faltam

Coloque WAV ou OGG em `public/audio/`, com estes nomes:

- Motor: `engine_idle`, `engine_low`, `engine_mid`, `engine_high`, `engine_limiter`, `engine_off_throttle`.
- Pisos e contato: `asphalt`, `kerb_rumble`, `grass`, `dirt`, `gravel`, `water`, `tire_screech`.
- Outros: `wind_aero`, `gear_upshift`, `gear_downshift`, `collision_carbon`, `countdown`, `race_start`, `record`.

Os seis arquivos de motor devem ter origem compatível e rotação conhecida. As rotações atuais de referência são 4200, 6300, 8400, 10500 e 12300 rpm; desaceleração em 8800 rpm. Ajuste `RecordedAudioEngine.ts` se as rotações da gravação forem diferentes. Registre fonte e licença em `src/audio/engine-approval.json` e só marque `approved: true` após conferir material, licença e cortes. Isso não obtém direitos de uso automaticamente.

O identificador antigo `gravel_grass` foi substituído por categorias independentes no caminho novo. A síntese antiga permanece no código como referência, mas não é instanciada pelo renderer.

Para converter arquivos já editados, coloque-os em `raw-audio/` e rode `npm run audio:prepare`. É necessário FFmpeg. O script preserva a dinâmica; a escolha dos cortes e a emenda dos loops continuam sendo trabalho de edição.

## Configurar o mapa de materiais

O mapa atual é `src/sim/surface-zones.json`, compartilhado por física, visual e áudio. Permanece vazio para preservar suas escolhas. Não reutilize o formato antigo de zonas apenas sonoras. Consulte `docs/superficies.md` para unidades, prioridades, referências e validação.

## Diagnóstico e validação

No console do navegador: `window.interlagosAudio.status` mostra arquivos carregados, pendentes, memória decodificada e os quatro contatos. Esse é um recurso de desenvolvimento.

Validação automatizada: `npm run lint`, `npm test`, `npm run build`. Foram adicionados testes para separação de pisos, zonas com passagem pela chegada, mistura de RPM, contatos por roda e ciclo de vida de áudio gravado. A suíte original também permanece, incluindo testes de helpers do sintetizador antigo; esses testes não significam que ele está ativo no jogo.

Não foi realizada avaliação auditiva de uma volta jogável nem medição de true peak do jogo com todos os sons finais. A medição da amostra do estudo anterior não equivale a validação da mixagem desta implementação. O Vite avisa sobre tamanho do bundle e uma futura mudança de carregamento de configuração; a compilação termina com sucesso.
