# Relatório - Software Architecture

![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/FEUP.jpg)

### Alunos:
* Luís Pedro Sousa Pinto, ee11169@fe.up.pt
* Rúben Alexandre da Fonseca Marques, ei10117@fe.up.pt 
* Nuno Soares Marques, ee11291@fe.up.pt

A arquitetura de software compreende o conjunto de decisões significativas acerca da organização de um sistema de software,
nomeadamente: nível mais elevado da decomposição do sistema em partes (estrutura de alto nível), com indicação dos blocos
básicos de construção de cada parte (classes, tabelas, ficheiros) e especificação de comportamentos envolvendo colaborações
entre as várias partes do sistema.

A abordagem à arquitetura do Meteor será fundamentado no modelo de 4+1 vistas de arquitetura de software. As 4 vistas representam a **vista lógica**, **vista de implementação**, **vista de processo** e **vista física**. A vista adicional (+1) trata-se da **vista de casos de utilização** cujo diagrama foi já apresentado no [último relatório] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/report2.md) exposto.

## Vista Lógica

A estrutura lógica de alto nível do sistema de software (divisão de responsabilidades), é descrita através de um ou mais
diagramas de pacotes lógicos em UML. Os diagramas de pacotes lógicos incluem pacotes de classes (incluindo classes para
modelar a base de dados e a interface com o utilizador) e dependências entre pacotes, sem preocupação de alocar classes a
componentes, processos ou máquinas.

O seguinte diagrama mostra a vista lógica alusivo ao projeto Meteor:

![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/LogicDiagram.png)

O Meteor é composto por 4 pacotes que definem a estrutura base do projeto. Sendo eles Meteor Packages, Client, Server e Command Line Tool "Meteor". Os pacotes MongoDB e MiniMongo são pacotes referentes às bases de dados que o Meteor recorre.
Os restantes pacotes são pacotes essenciais para o funcionamento dos pacotes da estrutura base.

**Meteor Packages** é o conjunto de todos os pacotes que o Meteor utiliza para o funcionamento "base" da app que queremos criar. É designado como a biblioteca dos pacotes do Meteor. Todos os pacotes podem ser consultados [aqui] (https://github.com/meteor/meteor/tree/devel/packages). 

O **pacote Client**, como o nome indica, vai ser responsável por efetuar todos os movimentos pretendidos pelo utilizador. Dentro do pacote contém templates globais que são de intervenção em caso de erro, estilos de app, templates de app com código Javascript e dois ficheiros, main.html e main.js, que estão responsáveis por guardar o main template e o seu código. 

O **pacote Server** irá interagir, a partir do protocolo DDP, com o Client. DDP é um protocolo dinâmico de websockets que será usado para a comunicação entre o Server e o Client. O Server possui dois ficheiros que contém o nosso código de publicação como responsável da app e código que irá alimentar a nossa base de dados a partir da primeira vez que corremos a app.

O **pacote Command Line Tool "Meteor"**, como no diagrama indica, irá ser uma peça fundamental para a conexão de todos os outros pacotes principais. É utilizado para juntar todas as peças do fluxo de trabalho de desenvolvimento do Meteor.

## Vista de Implementação
O **MongoDB** é responsável pela gestão da base de dados global das aplicações criadas em Meteor. Sendo uma base de dados de tipo “NOSQL”, esta base de dados é gerida usando JavaScript. Como uma das ideias fundamentais do Meteor, é criar aplicações usando apenas uma linguagem de programação, seja no servidor ou no cliente, o MongoDB foi escolhido para gestão dos dados pois usa Javascript na sua gestão de documentos tipo JSON. 

O **MiniMongo** é um reimplementação do MongoDB, mas que corre localmente. Quando um utilizador interage com uma aplicação criada em Meteor, ele acede a informação guardada no servidor global, que será guardada localmente para um mais rápido acesso. Caso essa informação seja modificada no servidor, a aplicação vai atualizar a nossa informação local automaticamente. No caso de ser o utilizador a modificar informação, a nossa base de dados será atualizada instantaneamente e a aplicação tratará de enviar a informação para o servidor global. Este método de troca de informação chama-se DDP(Distributed Data Protocol) e é baseado em “websockets”, aonde uma base dados local é parte de uma base de dados global.

O **Atmosphere** é um repositório de packages criados pelos utilizadores ou programadores da Meteor. Pode ser usado para procurar utilitários que facilitem o desenvolvimento de aplicações. Também é possível adicionar os nossos próprios packages a Atmosphere.

O **Blaze** é uma biblioteca para criar interfaces para o utilizadores, através de “templates” pré-definidas.  

## Vista de Processo

A vista de processo mostra os aspetos dinâmicos do sistema, explica os processos do sistema e como eles comunicam.

![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/Data_flow.png)

Achámos pertinente a inclusão de um diagrama de data flow de modo a compreendermos melhor o percurso que a informação percorre antes de ser refletida no DOM. 

Diagrama de Atividade

![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/Atividade.png)

A partir de ambos os diagramas podemos verificar como funciona o processo do Meteor. As alterações feitas ao cliente são comunicadas à base de dados (Mongo DB) através de um websocket. Essas alterações são por sua vez enviadas para a cache de dados do cliente (Minimongo) através do mesmo websocket. A partir daí é feita uma verificação de quais as alterações feitas e uma consequente re-renderização do DOM, alterando apenas os elementos necessários. De seguida, as alterações são exibidas na DOM.
A presença do Minimongo constitui uma das funcionalidades chave do Meteor, pois permite a reflexão das alterações em tempo real. Esta funcionalidade tem o nome de reatividade.


## Vista Física ou de Deployment

A vista física mostra a estrutura dos nós de hardware e os artefactos que neles correm. O diagrama seguinte mostra a vista de deployment do Meteor:


![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/Deployment.png)

Como podemos verificar no diagrama, a comunicação entre o servidor do Meteor e o cliente é feita através de HTTP, enquanto que a comunicação entre a cache de dados do cliente (Minimongo) e o Mongo no servidor é feita através do protocolo DDP. Isto permite que as alterações ao código se reflitam em tempo real no DOM. Por sua vez, o servidor do Meteor envia para o servidor da base de dados toda a informação alterada.

##Referências

* http://pt.slideshare.net/mongodb/meteor-next-generation-stack
* https://www.meteor.com/tutorials/blaze/creating-an-app
* http://docs.meteor.com/#/full/
* https://www.meteor.com/mini-databases
* https://www.mongodb.com/
* https://www.npmjs.com/
* http://coffeescript.org/
* https://www.meteor.com/ddp
* https://www.discovermeteor.com/blog/what-goes-where/



## FEUP ESOF MIEIC 
