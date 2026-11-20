# Parte 2 — motor gravado audível e diagnóstico

Esta versão mantém SOMENTE gravações: não ativa sintetizador, osciladores ou worklet de combustão. O arquivo verstappen_onboard.wav não foi aberto, convertido ou integrado.

## Executar a versão correta

Extraia interlagos-parte-2-som-real.zip em uma pasta nova. No Terminal, entre na pasta interlagos-parte-2-som-real e execute:

```
npm ci
npm run dev
```

Abra exatamente o endereço exibido nesse Terminal: se outro servidor estiver aberto em 3000, o Vite usará outra porta. Evite testar uma aba da versão anterior. Para encerrar o servidor antigo, use Control+C no Terminal correspondente.

Inicie uma corrida. Você deve ouvir o motor mesmo parado; ao acelerar a reprodução muda de velocidade e intensidade. Abra Pausa: use Ativar / testar áudio para liberar o contexto por clique e reproduzir uma gravação durante cerca de um segundo. Restaurar volumes desfaz volumes persistidos em zero, mas respeita o botão de mudo do jogo. Se o teste avisar que o jogo está no mudo, desative o mudo no HUD.

## O que mudou

- Inclusão de WAV original de loop gravado de automóvel, por qubodup, sob CC BY 3.0; créditos no jogo e em public/audio/CREDITS.txt.
- Motor provisório toca independentemente da aprovação das seis bandas definitivas. Não falsificamos engineReady nem nativeRpm: a gravação não tem RPM documentado.
- Resposta artística de velocidade de reprodução e intensidade ao estado do carro. Não é calibração de V6 F1 2026.
- Indicação visível de que o motor é gravado e provisório.
- Ativar / testar áudio e Restaurar volumes no menu de pausa.
- Tratamento de falha ao retomar AudioContext e diagnóstico do seu estado.
- Ajuste do ganho da rolagem real no asfalto.

## Fonte do motor e licença

Car Engine Loop 96kHz, 4s — qubodup
https://opengameart.org/content/car-engine-loop-96khz-4s
Licença escolhida dentre as oferecidas: CC BY 3.0
https://creativecommons.org/licenses/by/3.0/

O autor declara ter gravado sons de motor e processado um loop. Foi usado o WAV original de 96kHz/24bit do pacote, convertido a mono 48kHz/16bit com ganho +14,36dB. A reprodução no jogo varia pitch e volume. Nenhum áudio por IA ou oscilador foi acrescentado. Esta é gravação genérica de carro: NÃO é gravação de F1 nem representação fiel de 2026.

## Diagnóstico

window.interlagosAudio.status deve indicar:

- enginePlayable: true
- engineMode: recorded-provisional
- loaded contém engine_provisional
- loading: false
- contextState: running após interação válida no navegador
- engineReady: false — esperado enquanto as seis bandas definitivas não forem aprovadas.

A renderização offline no Chrome usando o grafo Web Audio e os WAV reais mediu sinal em baixa rotação (~−34,6 dBFS RMS) e aceleração (~−25,8 dBFS RMS), com silêncio exato no mudo. São medidas técnicas de sinal, não loudness integrado nem prova da saída física dos alto-falantes. O resultado está em validacao-audio-chrome.json.

npm run lint, npm test (35 testes), npm run build e npm run check:geom passaram. O teste de navegador está em audio-check.html, servido pelo Vite: http://localhost:PORTA/audio-check.html. Ele verifica o sinal offline; não toca nos alto-falantes. Para ouvir, use a corrida ou Ativar / testar áudio.

## Próximas etapas

Substituir o motor provisório por material apropriado com RPM documentado e completar efeitos ausentes. Depois, unificar superfícies/aderência/visual e revisar largura, elevação, entorno e estruturas. A pista e o cenário não foram remodelados nesta entrega.
