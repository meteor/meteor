# Relatório - Software Verification And Validation

![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/FEUP.jpg)

### Alunos:
* Luís Pedro Sousa Pinto, ee11169@fe.up.pt
* Rúben Alexandre da Fonseca Marques, ei10117@fe.up.pt 
* Nuno Soares Marques, ee11291@fe.up.pt

## Introdução

Este relatório tem como objetivo a análise dos processos de verificação e validação (V&V) seguidos no desenvolvimento e na utilização do **Meteor**.

Na primeira parte iremos apresentar um diagnóstico do grau de testabilidade do **Meteor**, explicando a controlabilidade dos componentes testados, a observabilidade dos resultados dos testes, a isolabilidade dos componentes, o grau de separação de funcionalidades, a compreensibilidade dos componentes e a heterogeneidade das tecnologias utilizadas.

Na segunda e última parte serão apresentadas algumas estatísticas de teste do **Meteor** relacionadas com os processos V&V do software. 

## Testabilidade do Software

### Controlabilidade

### Observabilidade

O **Meteor** utiliza uma ferramenta chamada [Velocity](https://github.com/meteor-velocity/velocity) para testes de integração e unitários.
**Velocity** é a estrutura oficial de corredor de testes do **Meteor.js** e permite que todos os utilizadores adicionem facilmente pacotes com estrutura de teste que conecte com o **Meteor**. Esta ferramenta lida com a criação de uma instância separada da nossa app para correr testes contra, com verificação de ficheiros e, em alterações, reativa novamente a execução dos testes, e imprime os resultados dos testes num formato que coisas como [velocity-html-reporter](https://github.com/meteor-velocity/html-reporter/ ) tem de funcionar. 

Para o **Velocity** poderiamos usar como suporte de framework o [Jasmine](https://github.com/xolvio/meteor-jasmine), [Mocha](https://github.com/mad-eye/meteor-mocha-web) ou [Cucumba](http://www.mhurwi.com/a-basic-cucumber-meteor-tutorial/), sendo o **Jasmine** o mais usado pelos utilizadores que realizem os seus testes unitários. Após a introdução do **Jasmine** e **Velocity** e uma série de comandos no **Meteor** teriamos de criar um diretório próprio para os testes. Com isto, é possível realizar os testes e vericá-los através de um relatório HTML que mostra a nossa app. A imagem abaixo ilustra como exemplo um teste realizado numa app:

![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/jasmineexample.PNG)


Para testes de integração podemos utilizar como suporte de framework para o **Velocity** o [Nightwatch](http://nightwatchjs.org/). Esta ferramenta irá realizar testes automatizados e integração de estrutura contínua baseado em **Node.js** e em *Selenium Webdriver*.
Apesar de ser uma boa escolha, é um processo complicado mas que depois irá servir para guardar mos os testes num diretório próprio. Exemplo de um teste Nightwatch:

![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/nightwatch.PNG)

### Isolabilidade

### Separação de Funcionalidades

No desenvolvimento de software, é importante assegurar que cada funcionalidade seja implementada da melhor maneira possível, isto é, que fique isolada ao componente no qual diz respeito. Assim, as componentes poderão ser mais testáveis. O **Meteor** deve ter em atenção este aspeto para ser fácil a sua restruturação e manutenção. A separação de funcionalidades está explicita no [último relatório realizado] (https://github.com/lpinto93/meteor/devel/ESOF-Docs/report3.md) e, cada um dos seus módulos, está responsável por tarefas complexas. Contudo, os módulos tem as suas estruturas bastante organizadas e isoladas. Este tópico é relevante para a funcionalidade dos testes, como foi dito em cima, apesar que dada a estrutura do **Meteor**, os testes não são feitos em todas as funcionalidades.

### Compreensibilidade


O Meteor está em continuo crescimento e possui uma documentação detalhada para auxiliar os utilizadores. Ao visitar-mos o site da aplicação, na página da [documentação](http://docs.meteor.com), temos a escolha entre ver a versão completa da aplicacão  ou apenas o necessário para a construção de aplicações com a framework.

Na versão [completa](http://docs.meteor.com/#/full/) da aplicação é fornecido uma informação detalhada sobre os seus componentes e sua funcionalidade. Na descrição de cada método pertencente a um componente é dado uma descrição do que o método executa, os seus argumentos de entrada e o breve explicação dos mesmos, e caso tenha retorno, explica-o. Como os métodos podem ser executados no cliente ou no servidor, ou em ambos, também indica aonde é utilizado. A imagem abaixo ilustra a documentação pertence do método [insert](http://docs.meteor.com/#/full/insert) pertence ao componente Collections:

//imagem

Consideramos que o Meteor possui uma documentação que ajuda a explicar os principais componentes da aplicação, fator muito importante para a testabilidade de uma aplicação. 

### Heterogeneidade

## Estatísticas de Teste

## Referências
* http://docs.meteor.com/#/full/
* http://www.softwaretestingclass.com/why-documentation-is-important-in-software-testing/
* https://semaphoreci.com/blog/2014/11/19/meteorjs-getting-started.html


## FEUP ESOF MIEIC




