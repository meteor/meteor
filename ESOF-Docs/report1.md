# Relatório

### Alunos:
* Luís Pedro Sousa Pinto, ee11169@fe.up.pt
* Rúben Alexandre da Fonseca Marques, ei10117@fe.up.pt 
* Nuno Soares Marques, ee11291@fe.up.pt

# Descrição do Projeto

## Meteor - The JavaScript App Platform

![alt tag] (https://github.com/lpinto93/meteor/blob/devel/ESOF-Docs/resources/og-image-logo.png)

O [Meteor] (https://www.meteor.com/) é um framework de aplicações web open-source, real-time e multi-plataforma construído com base em tecnologia comprovada,
que permite a criação muito rápida de protótipos e produz código multi-plataforma (web, Android, iOS).
Foi introduzido em Dezembro de 2011 com o nome de Skybreak.

Com o Meteor, criamos apps:

* em JavaScript
* que enviam informação sobre o fio, em vez de HTML
* em que podemos utilizar bibliotecas populares open-source

O objetivo desta plataforma é criar software de uma maneira mais simples, como produzir uma nova plataforma para aplicações cloud
que se vai tornar tão omnipresente quanto as plataformas anteriores (Unix, HTTP e a base de dados relacional). 

O Meteor foi desenvolvido para ser fácil de aprender, incluíndo para principiantes. É utilizado Javascript como a única linguagem de programação porque só essa é usada no cliente (jQuery) assim como no servidor (Node.js, Underscore). Como base de dados, o Meteor suporta MongoDB que está presente na interface do cliente assim como no servidor, onde não é necessário aprender um novo modelo de código.

# Processo

O Meteor contém uma comunidade bastante populosa com colaboradores por todo mundo. A equipa é constituída por 26 elementos com
historial de experiência bastante fascinante. A Meteor usa um [roadmap] (https://trello.com/b/hjBDflxp/meteor-roadmap) para comunicar em relação ao que estão a trabalhar neste momento e no que vão trabalhar no futuro.

Para contribuir para o projeto podemos reportar bugs, adicionar novos packages e efetuar mudanças na Meteor core. Ao reportar os bugs devemos colocar um report com reproduction recipe no [issue tracker] (https://github.com/meteor/meteor/issues) do [GitHub da Meteor] (https://github.com/meteor/meteor). Caso seja um bug de segurança, devemos mandar um email para security@meteor.com em vez de colocar o report. Para mais informações sobre o reproduction recipe siga as instruções do tópico "Reporting a bug in Meteor" desta [página] (https://github.com/meteor/meteor/wiki/Contributing-to-Meteor).
Adicionar novos packages ao Meteor deve ser feita através de uma [Atmosphere] (https://atmospherejs.com/) package. A package deve ter testes como por exemplo o [test] (https://github.com/iron-meteor/iron-router/tree/master/test) do master branch no [iron:router] (https://atmospherejs.com/iron/router).
Para realizar mudanças no core da Meteor podemos contribuir submetendo um pull request ou propondo a nossa mudança a um core developer como, por exemplo, através da [Devshop] (https://devshop.meteor.com/) em São Francisco. Submeter um pull request pode não ser tão simples quanto parece. Devemos seguir as próximas instruções para efetuar um pull request:

* Assinar o [contributor's agreement] (https://contribute.meteor.com/).
* A base do nosso trabalho tem de ser realizada no devel branch. 
* Mudar o nome do branch de acordo com o bug ou característica que estamos a submeter.
* Apenas enviar um bug ou característica por pull request
* Enviar com os testes realizados que comprovam que o código funciona.
* Seguir o [MDG style guide] (https://github.com/meteor/meteor/wiki/Meteor-Style-Guide) para o código e para submeter mensagens.
* Não se esquecer que a pessoa que fez o pull request ter o nome completo e o email no Git.

Analisando a actividade no Github, a cada nova versão da aplicação é criado um novo branch, possibilitando um fácil e rápido conhecimento das etapas que a aplicação percorreu. A cada nova feature também é criado um novo ramo, que quando concluído e testado é adicionado à versão master. Como cada nova feature só é adicionada caso passe por um estrutura de testes, podemos presumir que o processo TDD (Test Drive Development) é usado no desenvolvimento. Neste processo, composto por 5 etapas, são programados os testes que definem a nova funcionalidade. Só depois de ela passar os testes previamente feitos é que será adicionada ao projeto principal. Isto previne que cada nova funcionalidade entre em conflito com o código feito até então.

#Análise Crítica

O lançamento de muitas versões torna-se um incómodo para os utilizadores, porque ocorrem problemas de compatibilidade. Isto pode levar a um desencorajamento por parte dos utilizadores que estão a testar as aplicações. Por outro lado, são facilmente detetados bugs pelos utilizadores e corrigidos pela equipa de trabalho.

A ideia de um lançamento antecipado para teste de mercado para depois melhorá-lo com o "feedback" dos utilizadores também pode ser interpretado como "delivery over quality".

Responding to change over Following a plan
Uma escolha pobre das funcionalidades necessárias pode levar a uma sobrecarga de trabalho dos "developers", que por sua vez pode levar a um esgotamento das capacidades da equipa de trabalho.

Todas as mudanças que são feitas ao projeto têm um custo, podem dificultar a previsão dos custos totais e se o "budget/orçamento" será suficiente para o cobrir o custo do projeto.

## FEUP ESOF  MIEIC
