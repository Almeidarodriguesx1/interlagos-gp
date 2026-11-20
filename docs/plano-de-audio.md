# Plano de viabilidade do áudio de Interlagos

Preparado em 17 de novembro de 2026 a partir do ZIP fornecido e de fontes consultadas nesta data.

**Parecer: é tecnicamente viável melhorar muito a imersão sem trocar a tecnologia do jogo.** O caminho é usar gravações existentes, editadas e controladas pela simulação. A maior dependência para reproduzir fielmente um carro de 2026 é obter gravações licenciáveis dessa geração, com qualidade e cobertura suficientes. O demonstrativo entregue comprova a adaptação de superfícies; não comprova o motor de 2026.

## O que encontrei no seu projeto

O ZIP contém dois projetos: a versão web em React/Three.js com Web Audio e uma versão Godot. Minha recomendação é começar pela versão web, cujo sistema de áudio está mais desenvolvido. A integração Godot exige trabalho separado; copiar arquivos para a pasta da versão web não altera o áudio Godot.

| Constatação no código recebido | Consequência prática |
|---|---|
| `public/audio/` contém apenas `.gitkeep`; não há arquivos de som reais no ZIP. | O sistema atual funciona com áudio sintetizado, apesar de estar preparado para carregar gravações. |
| `src/audio/soundBank.ts` prevê 14 arquivos e aceita `.ogg` ou `.wav`. | Podemos aproveitar o carregador e substituir as fontes gradualmente. |
| `F1AudioEngine.ts` já usa RPM, acelerador, marcha, velocidade, derrapagem, chuva, câmera e posição dos rivais. | Há boa parte da infraestrutura necessária para áudio reativo. |
| O motor real usa cinco faixas de RPM, centradas em 4.200, 6.300, 8.400, 10.500 e 12.300 rpm. | As gravações precisam de RPM de referência conhecido; renomear cortes aleatórios não basta. |
| O modo de motor real é ativado com apenas três das cinco faixas. | Devemos validar a cobertura de toda a rotação antes da ativação para evitar regiões sem uma faixa adequada. |
| O áudio ainda mantém síntese com ganho de 0,14 quando as gravações de motor estão presentes. | Para cumprir seu pedido de usar sons existentes, precisamos de um modo composto somente por gravações, retirando essa camada. |
| Há somente `onTrack` e `onKerb` para identificar os pisos no áudio. O arquivo `gravel_grass` atende tudo que está fora da pista. | Terra, brita, grama e escape asfaltado podem tocar o mesmo efeito. A identificação dos materiais precisa mudar antes da mixagem final. |
| O carro é tratado como uma unidade para essas superfícies. | Ainda não podemos representar corretamente duas rodas na zebra e duas no asfalto. |
| O script de conversão aplica o mesmo preset de loudness a todos os arquivos e não verifica o código de saída do FFmpeg antes de anunciar sucesso. | A preparação precisa preservar a relação de volume entre sons e detectar conversões malsucedidas. |
| O script Godot `F1AudioSynth.gd` produz formas de onda; não há banco de amostras equivalente. | No Godot, será preciso implementar a reprodução das gravações e os controles por superfície. |

Estas são conclusões de leitura do código. Não executei uma sessão jogável nem medi o desempenho do jogo completo. O ZIP original permanece intacto; os arquivos fornecidos são um estudo e um kit de ensaio.

## O alvo sonoro de 2026

A arquitetura continua sendo V6 1,6 litro turbo, mas sem MGU-H e com maior participação do MGU-K. Isso orienta a escolha das gravações; não determina sozinho o timbre. O som também depende do fabricante, rotação, carga, escapamento, posição do microfone e ambiente. Não devemos prometer que uma equalização transforma um V8 antigo em um V6 de 2026. [Explicação oficial da Honda](https://global.honda/en/F1/features/2026_Commentary/regulations/).

**Referência para ouvir:** [The F1 Power Unit Sound of 2026 — Honda Racing F1](https://www.youtube.com/watch?v=zk4oFrofU8A). A publicação é uma referência de escuta; não foi incorporada ao kit nem fornece, por si só, permissão para redistribuir o áudio no jogo.

Para a fidelidade desejada, eu escolheria primeiro **um fabricante e uma perspectiva de referência**, começando pelo cockpit. Depois faria a câmera externa. Misturar gravações de fabricantes, anos e perspectivas diferentes tende a produzir mudanças de timbre durante a aceleração.

O código também usa eventos de DRS. Para representar 2026, esses eventos devem acompanhar os estados reais da aerodinâmica ativa e do sistema de energia que forem implementados na simulação. Não basta trocar o nome do efeito. A mudança de DRS para aerodinâmica ativa é descrita pela [Honda](https://global.honda/en/F1/features/2026_Commentary/regulations/).

## Fontes existentes que conferi

| Fonte | Utilidade e decisão |
|---|---|
| [Freesound: gravel road, de seth-m](https://freesound.org/people/seth-m/sounds/341069/) | Gravação de Honda CR-V em cascalho, com licença CC0. Usei na prova de conceito de brita. Não é gravação de pneu slick de F1. |
| [Freesound: rumble strip exit 41.wav, de bsumusictech](https://freesound.org/people/bsumusictech/sounds/62652/) | Gravação de faixas sonoras de rodovia, CC0. Usei como textura rítmica provisória de zebra. Deve ser substituída por gravação de zebra de autódromo para maior fidelidade. |
| [Pole Position: The Vehicle Stone Chip Hits Library](https://pole.se/product/vehicle-stone-chip-hits-sound-effects/) | US$ 29 anunciados na consulta; 53 arquivos de pedras atingindo carroceria, rodas e caixas de roda. Candidata para complementar a brita com impactos discretos. A ressonância dos materiais precisa ser avaliada para o monoposto. |
| [Pole Position: F1 Williams FW29 2007](https://pole.se/product/f1-williams-fw29-2007/) | US$ 449 anunciados; gravações reais de V8, com várias perspectivas. Não recomendo comprar para o alvo 2026. |
| [ROHHSA: Formula 1 Racing Sounds](https://rohhsa.itch.io/formula-1-racing-sounds) | O autor descreve mais de 40 loops elaborados a partir do estudo de sons de corrida. A página não comprova captação de um V6 de 2026. Não selecionei como fonte real para seu motor. |

Os dois sons Freesound estão identificados como CC0 nas próprias páginas, permitindo adaptação e distribuição. Mesmo sem obrigação de crédito nessa licença, registrei autoria e origem. A biblioteca Pole Position permite edição e uso em jogos sob sua [licença](https://pole.se/shop/eula/); o acesso de vários editores requer atenção ao número de usuários. Não comprei nenhum pacote.

**Resultado da pesquisa:** não confirmei, nas fontes consultadas, um pacote pronto de gravações reais de motor F1 2026, com cobertura de RPM e licença de integração adequadas. Isso não significa que ele não exista. Para fechar essa parte, precisamos de catálogo mais específico ou de uma proposta do detentor das gravações.

## Como o áudio deve reagir ao jogo

| Situação | Gravações e comportamento propostos |
|---|---|
| Aceleração | Loops de motor de uma mesma origem em diferentes RPM e cargas, misturados com transições contínuas. Pequena alteração de velocidade de reprodução ao redor do RPM original. |
| Soltar o acelerador | Faixas de desaceleração próprias, com mudança de carga. Não apenas abaixar o volume da aceleração. |
| Troca de marcha | Queda de rotação sincronizada com a física e gravação curta do mecanismo, quando disponível. Evitar duplicar uma troca já presente no loop. |
| Pneu no asfalto | Rolagem contínua proporcional à velocidade; camada de aderência/derrapagem controlada pelo escorregamento. O pneu não deve chiar em toda curva. |
| Zebra | Rolagem áspera mais impactos de suspensão, com intensidade por roda, carga e contato. O ritmo deve acompanhar a velocidade sobre as nervuras do trecho. |
| Terra | Atrito granular mais abafado, com poucos impactos de pedra. Varia com velocidade, carga e deslizamento. |
| Brita | Textura contínua mais impactos irregulares de pedrinhas, com várias tomadas e limite de vozes. |
| Grama | Atrito mais macio, roçagem e movimentos de suspensão. Não reutilizar a brita como som final. |
| Escape asfaltado | Continua sendo piso rígido. Sair da linha branca não pode, por si só, disparar terra/brita. |
| Piso molhado | Camada própria de contato com água e spray, controlada por velocidade e quantidade de água. Não tratar chuva apenas como filtro no som seco. |
| Cockpit e câmera externa | Perspectivas e níveis diferentes, mantendo os mesmos eventos físicos. Rivais devem receber posicionamento e variação de distância coerentes. |

O contato deve ser calculado nos quatro pontos de roda, usando a mesma posição, orientação e largura de via da simulação. Cada contato precisa informar material, velocidade, carga e escorregamento. A zona de superfície deve vir do mapa físico da pista, não apenas da aparência da textura. Precisamos revisar onde há asfalto, grama, terra ou brita no traçado representado; não vou presumir que toda área externa de Interlagos tenha o mesmo piso.

A zebra pode ser modelada inicialmente por `frequência de contato ≈ velocidade sobre o relevo / espaçamento entre nervuras`, com geometria e gravação calibradas. O impacto da roda traseira deve respeitar o tempo que ela leva para alcançar o relevo. São decisões de projeto propostas, ainda não implementadas.

Manteria o Web Audio existente, com grupos separados de motor, pneus/superfícies, vento, impactos, ambiente e interface. Os loops permanecem carregados e suas intensidades mudam suavemente. Impactos usam um conjunto limitado de vozes e tomadas alternadas. Um motor contínuo não deve receber variações aleatórias de afinação usadas em efeitos curtos.

## Execução, prazo e custo

Estimativas de planejamento para uma pessoa experiente em código e edição de áudio, trabalhando na versão web. Não são orçamento contratado. O prazo do motor depende de receber as gravações e sua autorização de uso.

| Etapa | Entrega verificável | Esforço estimado |
|---|---|---|
| 1. Prova de conceito | Reproduzir as duas superfícies reais com os gatilhos atuais; ajustar volumes iniciais. O kit entregue já fornece os arquivos para esse ensaio. | 0,5–1 dia |
| 2. Materiais e rodas | Separar pisos no mapa; contato por roda; impedir brita sobre escape asfaltado; indicador de diagnóstico. | 2–3 dias |
| 3. Banco de superfícies | Editar e calibrar zebra, terra, brita, grama, asfalto e água; controlar transições e impactos. | 2–3 dias após selecionar as fontes |
| 4. Motor real | Organizar faixas de RPM e carga; aceleração/desaceleração; marchas; perspectivas; desligar as fontes sintetizadas. | 2–4 dias após receber material adequado |
| 5. Mixagem e desempenho | Volta de avaliação, limites de vozes, carregamento, volume e comparação em fones e caixas. | 1–2 dias |

Total indicativo: **8–13 dias de trabalho**, além da busca/licenciamento que não tenha prazo confirmado. Godot não está incluído nessa estimativa.

O demonstrativo tem custo de licença de áudio de **US$ 0**. A biblioteca opcional de impactos custa **US$ 29** na consulta, antes de eventuais tributos. Não há preço confirmado para as gravações do motor de 2026. Eu não autorizaria a compra do V8 de US$ 449 para tentar corrigir a geração por edição.

Como metas iniciais de engenharia, proporia banco essencial comprimido de 10–25 MB e memória decodificada abaixo de 64 MB. São limites a validar no dispositivo escolhido. O arquivo comprimido pequeno não garante pouco uso de memória após a decodificação. Não introduziria middleware nesta primeira etapa: os problemas identificados podem ser tratados na arquitetura atual.

## Critérios de aceitação

- Acelerar e desacelerar por toda a faixa útil de RPM sem silêncio, saltos de timbre ou trocas duplicadas. Registrar o RPM original de cada amostra e ajustar as faixas ao material real.
- Distinguir asfalto, zebra, terra, brita, grama e água pela escuta em um ensaio de identificação, e confirmar que o som corresponde ao piso sob as rodas.
- Ao colocar apenas as rodas esquerdas na zebra, ouvir intensidade e posição coerentes; rodas no ar não produzem contato.
- As transições de piso não estalam e o som de contato some ao parar. Não deve haver brita em uma área de escape asfaltada.
- Reproduzir uma volta representativa de 2–5 minutos, medir volume/pico e verificar saturação, repetição e carga de áudio. Começar com margem de pelo menos 3 dB no pico da mixagem e ajustar pela captura.
- Testar início do áudio após interação do usuário, pausa, mudo, reinício da corrida e troca de câmera, sem fontes acumuladas.
- Verificar o modo composto somente por gravações: ausência de osciladores, ruído sintetizado e worklet de combustão no sinal ouvido.

## A amostra entregue

Em `audio-real-interlagos/`, o arquivo `demonstracao-superficies.mp3` tem 20 segundos. A sequência é: rolagem suave; textura rítmica à esquerda em 2,5 s; segunda passagem à direita em 6 s; entrada na brita em 10 s; reprodução mais lenta em 15 s; retorno à rolagem em 17,8 s.

**Toda a matéria sonora vem das duas gravações CC0.** Fiz cortes, filtros, ajuste de volume, velocidade de reprodução, balanço estéreo e transições de loop. Não usei geração por IA, osciladores ou ruído sintetizado. A amostra não contém motor de F1. As variações de velocidade são demonstrações artísticas, ainda sem calibração em km/h.

As fontes usadas são as prévias públicas MP3 do Freesound. Para produção, recomendo obter os WAV originais pelo download da plataforma. Converter uma prévia para WAV não recupera qualidade perdida; o kit registra essa limitação.

Os WAV de ensaio têm 48 kHz, e os loops estéreo têm picos de -6 dBFS. A medição da demonstração MP3 resultou em **-24,2 LUFS integrados e pico verdadeiro de aproximadamente -3,3 dBTP**. Isso verifica o arquivo entregue, não a futura mixagem com motor e rivais. Os pontos de loop receberam crossfade; a aprovação auditiva continua necessária.

Para um primeiro teste na versão web, o kit inclui `public/audio/kerb_rumble.wav` e `public/audio/gravel_grass.wav`, nomes já aceitos pelo carregador. O segundo ainda dispara para todo o fora de pista no código atual: é um ensaio de integração, não a separação final dos pisos. O jogo completo continua contendo síntese até a implementação do modo baseado somente em gravações.

**Recomendação:** começar pelas superfícies e pela identificação de contato por roda. Em paralelo, selecionar uma origem licenciável para o V6 de 2026. Essas duas frentes permitem melhorar o jogo agora e avaliar o motor por comparação com uma referência real, sem comprometer o orçamento com a geração errada.
