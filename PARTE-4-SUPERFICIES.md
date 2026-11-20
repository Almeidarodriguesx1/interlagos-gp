# Parte 4 — materiais compartilhados e simulação a 180 Hz

## O que muda nesta versão

- Física, visual do escape e áudio usam `src/sim/surfaceModel.ts` e um único mapa, `src/sim/surface-zones.json`. O antigo mapa exclusivo de áudio foi removido.
- O escape asfaltado deixa de receber penalidade de aderência/resistência só por estar fora da linha branca. Agora asfalto continua asfalto até o limite de 6,95 m previsto na geometria. Zebras conservam a redução de aderência, maior na chuva. Perfis de grama, terra e brita estão preparados para áreas futuras confirmadas; seus coeficientes são ajustes de jogo.
- As zonas possuem circuito, fonte, estado de validação e limites. Registros pendentes são ignorados; dados inválidos ou sobrepostos são rejeitados. Uma zona confirmada passa a alterar a cor/material PBR do escape, o som e a física juntos. O suporte desta etapa cobre o corredor já construído, sem ampliar suas dimensões.
- A grama já existente ganhou manchas sutis de cor por vértice, sem novas áreas, texturas baixadas, objetos ou chamadas de desenho. O mapa continua vazio: nenhuma posição de brita/terra foi inventada.
- A simulação passa de 120 para 180 Hz por acumulador; havia um teto anterior de quatro passos que perdia tempo abaixo de 30 FPS. O novo teto é 18 passos (100 ms), preservando tempo até 10 FPS. O contador de descarte informa travamentos maiores. Entrada de DRS fica pendente até o próximo passo físico, evitando perdê-la em telas acima de 180 Hz.
- Os quatro objetos de contato de áudio são reutilizados; não se cria mais um array de tuplas/objetos por quadro para essa amostragem. Isto não elimina todas as alocações do jogo: projeções, IA e parâmetros de áudio ainda precisam de otimização.
- Corrigida a inicialização de áudio ao abrir com `?autostart=1`, caminho que antes iniciava a corrida sem preparar o banco. O desbloqueio continua sujeito à interação exigida pelo navegador.

## O que foi preservado

Nenhuma mudança de largura, traçado, elevação, posição de zebras ou muros. Comparação dos buffers de posição com a Parte 3: diferença máxima **0 m** em pista, escape, zebras, muros e terreno de Interlagos, Monza e Spa (`validacao-parte4-geometria.json`). Isso comprova preservação, não precisão topográfica real.

As gravações e a mixagem da Parte 3 foram mantidas. Não há síntese nova, recorte de onboard nem novos downloads de áudio. O motor continua genérico gravado e provisório; `enginePlayable=true` e `engineReady=false` são esperados. O banco V6 F1 2026 ainda depende das seis gravações licenciadas e calibradas.

Grama e brita continuam no teste do menu. Os muros impedem alcançá-las em muitos pontos do modelo; esta versão não cria atalhos ou escapes fictícios. A física ainda consulta o centro do carro, enquanto o áudio consulta quatro rodas: transições com apenas um pneu fora podem soar antes da troca de material do centro. Veja `docs/superficies.md`.

## Como testar

1. Extraia `interlagos-parte-4-superficies.zip` em uma pasta nova. Abra o Terminal nessa pasta e rode:

   ```sh
   npm ci
   npm run dev
   ```

2. Abra **a URL exibida por esse servidor**, pois outra versão pode estar ocupando a porta 3000. Inicie a corrida normalmente.
3. Acelere e passe pelas zebras; alterne cockpit/T-Cam e câmera externa. O timbre gravado e os controles de volume são os da Parte 3.
4. Passe da linha branca para o escape asfaltado acessível. Ele deve continuar com som de asfalto e não disparar brita. Compare frenagem no seco/molhado e a resposta nas zebras.
5. Em Pausa > Áudio, selecione Grama (foley), Brita, Frenagem na brita, Marchas ou Pneus/frenagem e clique **Ativar / testar áudio**. Não tente atravessar muros para chegar a materiais ainda sem posição confirmada.
6. Observe a variação de tons nas áreas gramadas existentes. Não foram acrescentadas pedras, brita visível, arquibancadas ou boxes nesta fase.
7. Para diagnóstico, abra com `?debug=cam`: a sobreposição mostra FPS, frequência física e tempo descartado. `window.__f1Debug.getStats()` inclui `physicsHz`, `physicsSteps` e `physicsDroppedSeconds`; `window.interlagosAudio.status` mantém carregamento, contatos e estado do motor.

## Validação e limites

- `npm run lint`, `npm test` (42 testes), `npm run build` e `npm run check:geom`.
- Testes cobrem mapa com passagem pela chegada, lados assimétricos, proveniência/conflitos, zonas pendentes, reutilização de contatos, maior resistência em brita, menor frenagem em brita/grama molhada e concordância entre triângulos visuais e sons. As zonas dos testes não são distribuídas no JSON de produção.
- O relógio simula 10 s sem perda a 12,5/20/30/60/120/144/240 FPS; a corrida chega ao mesmo estado a 30 e 144 FPS com os mesmos comandos.
- Chrome headless/SwiftShader: cena e menu abriram sem exceções JavaScript; motor gravado carregado, contexto running, nove amostras carregadas, sem erro de reprodução e cerca de 4,5 MB decodificados. Resultado em `validacao-parte4-browser.json`. É verificação técnica de carregamento/execução, não aprovação auditiva nem medição de pico/loudness.
- Esse teste por software atingiu apenas 3–4 FPS e descartou tempo físico acima do teto. O jogo funciona, mas esse desempenho não é satisfatório para dirigir. Otimização de chamadas de desenho, sombras e custo da cena permanece para a fase de desempenho; não houve medição representativa com GPU dedicada.
- O build mantém avisos existentes de bundle acima de 500 kB e de configuração futura do Vite. O JS principal fica em aproximadamente 1,03 MB (286 kB gzip). O ZIP inclui fonte, build e assets; não inclui node_modules.

Próxima fase proposta: validar por referências as zonas reais de escape e depois trabalhar entorno/estruturas, mantendo a mesma base de materiais. Antes de publicar uma nova zona, revisar a referência e o efeito em física, aparência e som.
