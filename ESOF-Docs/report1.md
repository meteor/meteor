# Relatório

### Alunos:
* Luís Pedro Sousa Pinto, ee11169@fe.up.pt
* Rúben Alexandre da Fonseca Marques, ei10117@fe.up.pt 
* Nuno Soares Marques, ee11291@fe.up.pt

# Descrição do Projeto

## Meteor - The JavaScript App Platform

[Meteor] (https://www.meteor.com/) é um open-source, real-time, e framework de aplicações web multi-plataforma construído em cima de tecnologia comprovada,
que permite a criação de protótipos muito rápido e produz código multi-plataforma (web , Android, iOS).
Meteor foi introduzido em Dezembro de  2011 com o nome de Skybreak.

Com o Meteor, criamos apps:

* em JavaScript
* que envia informação sobre o fio, em vez de HTML
* em que pudemos utilizar bibliotecas populares de open-source

O objetivo desta plataforma é criar software de uma maneira mais simples como produzir uma nova plataforma para aplicações cloud
que vão se tornar tão onipresentes quanto as plataformas anteriores (Unix, HTTP e a base de dados relacional). 

Meteor foi desenvolvida para ser fácil de aprender, incuíndo principiantes. É utilizada Javascript como a única linguagem de programação porque é só essa usada no cliente (jQuery) assim como no servidor (Node.js, Underscore). Como base de dados, Meteor suporta MongoDB que está presente na interface do cliente assim como no servidor, onde não é necessário aprender um novo modelo de código.

# Processo

Meteor contém uma comunidade bastante populosa com colaboradores por todo mundo. A equipa é constituída por 26 elementos com
historial de experiência bastante fascinante. A Meteor usa um [roadmap] (https://trello.com/b/hjBDflxp/meteor-roadmap) para comunicar em relação ao que estão a trabalhar neste momento e no que vão trabalhar no futuro.

Para contribuir com o projeto podemos reportar bugs, adicionar novos packages e efetuar mudanças na Meteor core. Ao reportar os bugs devemos colocar um report com reproduction recipe no [issue tracker] (https://github.com/meteor/meteor/issues) do [GitHub da Meteor] (https://github.com/meteor/meteor). Caso seja um bug de segurança, devemos mandar um  email para security@meteor.com em vez de colocar o report. Para mais informações sobre o reproduction recipe siga as instruções do tópico "Reporting a bug in Meteor" desta [página] (https://github.com/meteor/meteor/wiki/Contributing-to-Meteor).
Adicionar novos packages para a Meteor deve ser feita através de uma [Atmosphere] (https://atmospherejs.com/) package. A package deve ter testes como por exemplo o [test] (https://github.com/iron-meteor/iron-router/tree/master/test) do master branch no [iron:router] (https://atmospherejs.com/iron/router).
Para realizar mudanças no core da Meteor podemos contribuir submetendo um pull request ou propondo a nossa mudança a um core developer como, por exemplo, através da [Devshop] (https://devshop.meteor.com/) em San Francisco. Submeter um pull-request pode não ser tão simples quanto parece. Devemos seguir as próximas intruções para efetuar um pull request:

* Assinar o [contributor's agreement] (https://contribute.meteor.com/).
* A base do nosso trabalho tem de ser realizada na devel branch. 
* Mudar o nome da branch de acordo com o bug ou característica que estamos a submeter.
* Apenas enviar um bug ou característica por pull request
* Enviar com os testes realizados que comprovam que o código funciona.
* Seguir o [MDG style guide] (https://github.com/meteor/meteor/wiki/Meteor-Style-Guide) para o código e para submeter mensagens.
* Não se esquecer que a pessoa que fez o pull request ter o nome completo e o email no Git.

Analisando a actividade no Github, a cada nova versão da aplicação é criado um novo branch, possibilitando um facil e rapido conhecimento das etapas que a aplicação percorreu. A cada nova feature também é criado um novo ramo, que quando concluida e testada é adicionada a versão master. Como cada nova feature, só é adicionada caso passe por um estrutura de testes, leva-nos a presumir que o processo TDD(Test Drive Development) é usado no desenvolvimento. Neste processo, composto por 5 etapas, são programados os testes que definem a nova funcionalidade, só depois ela passar os testes previem feitos, será adicionado ao projeto principal. Isto previne que cada nova funcionalidade, não entre em conflito com o código feito até então.

#Análise Crítica

O lançamento de muitas versões, torna-se um incomodo para os utilizadores, porque encontram problemas de compatibilidade. Isto pode levar a um desencorajamento por partes dos utilizadores que estão a testar as aplicações. Por outro lado, são facilmente detetados bugs pelos utilizadores e corrigidos pela equipa de trabalho.

A ideia de um lançamento cedo para teste de mercado, para depois melhorá-la com o "feedback" dos utilizadores, também pode ser interpretada como "delevery over quality".

Responding to change over Following a plan
Uma escolhe pobre das funcionalidades necessárias, pode levar a uma sobrecarga de trabalho dos "developers" que pode levar a um esgotamento das capacidades da equipa de trabalho.

Todas as mudanças que é feito ao projecto tem um custo , pode dificultar prever quais os custos totais e se o "bugget/orçamento" vai ser suficiente para o custo do projecto.

## FEUP ESOF  MIEIC
