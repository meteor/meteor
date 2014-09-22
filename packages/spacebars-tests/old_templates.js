// This file contains templates compiled with a pre-0.9.0 version of
// spacebars-compiler. We run the entire suite of tests as we had on
// 0.9.0 against these compiled template. The test suits is found
// in old_templates_tests.js
//
// Why? Packages are published in built form. With Meteor 0.9.1, we
// didn't bump the major version of the 'templating' package (which
// would force packages that define templates to publish new versions
// of their package). Instead, we decided to keep backcompat with the
// old Blaze runtime APIs.
//
// If these tests ever break in the future, and backcompat is too hard
// to achieve (or undesirable), we can simply bump the major version
// of the 'templating' package, and get rid of these tests.
Template.__define__("old_spacebars_template_test_aaa", (function() {
  var view = this;
  return "aaa";
}));

Template.__define__("old_spacebars_template_test_bbb", (function() {
  var view = this;
  return "bbb";
}));

Template.__define__("old_spacebars_template_test_bracketed_this", (function() {
  var view = this;
  return [ "[", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("."));
  }), "]" ];
}));

Template.__define__("old_spacebars_template_test_span_this", (function() {
  var view = this;
  return HTML.SPAN(Blaze.View(function() {
    return Spacebars.mustache(view.lookup("."));
  }));
}));

Template.__define__("old_spacebars_template_test_content", (function() {
  var view = this;
  return Blaze.InOuterTemplateScope(view, function() {
    return Spacebars.include(function() {
      return Spacebars.call(view.templateContentBlock);
    });
  });
}));

Template.__define__("old_spacebars_template_test_elsecontent", (function() {
  var view = this;
  return Blaze.InOuterTemplateScope(view, function() {
    return Spacebars.include(function() {
      return Spacebars.call(view.templateElseBlock);
    });
  });
}));

Template.__define__("old_spacebars_template_test_iftemplate", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("condition"));
  }, function() {
    return [ "\n    ", Blaze.InOuterTemplateScope(view, function() {
      return Spacebars.include(function() {
        return Spacebars.call(view.templateContentBlock);
      });
    }), "\n  " ];
  }, function() {
    return [ "\n    ", Blaze.InOuterTemplateScope(view, function() {
      return Spacebars.include(function() {
        return Spacebars.call(view.templateElseBlock);
      });
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_simple_helper", (function() {
  var view = this;
  return Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"), view.lookup("bar"));
  });
}));

Template.__define__("old_spacebars_template_test_dynamic_template", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("foo"));
}));

Template.__define__("old_spacebars_template_test_interpolate_attribute", (function() {
  var view = this;
  return HTML.DIV({
    "class": function() {
      return [ "aaa", Spacebars.mustache(view.lookup("foo"), view.lookup("bar")), "zzz" ];
    }
  });
}));

Template.__define__("old_spacebars_template_test_dynamic_attrs", (function() {
  var view = this;
  return HTML.SPAN(HTML.Attrs(function() {
    return Spacebars.attrMustache(view.lookup("attrsObj"));
  }, function() {
    return Spacebars.attrMustache(view.lookup("singleAttr"));
  }, function() {
    return Spacebars.attrMustache(view.lookup("nonexistent"));
  }), "hi");
}));

Template.__define__("old_spacebars_template_test_triple", (function() {
  var view = this;
  return Blaze.View(function() {
    return Spacebars.makeRaw(Spacebars.mustache(view.lookup("html")));
  });
}));

Template.__define__("old_spacebars_template_test_triple2", (function() {
  var view = this;
  return [ "x", Blaze.View(function() {
    return Spacebars.makeRaw(Spacebars.mustache(view.lookup("html")));
  }), Blaze.View(function() {
    return Spacebars.makeRaw(Spacebars.mustache(view.lookup("html2")));
  }), Blaze.View(function() {
    return Spacebars.makeRaw(Spacebars.mustache(view.lookup("html3")));
  }), "y" ];
}));

Template.__define__("old_spacebars_template_test_inclusion_args", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return Spacebars.call(view.lookup("bar"));
  }, function() {
    return Spacebars.include(view.lookupTemplate("foo"));
  });
}));

Template.__define__("old_spacebars_template_test_inclusion_args2", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return Spacebars.dataMustache(view.lookup("bar"), Spacebars.kw({
      q: view.lookup("baz")
    }));
  }, function() {
    return Spacebars.include(view.lookupTemplate("foo"));
  });
}));

Template.__define__("old_spacebars_template_test_inclusion_dotted_args", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return Spacebars.call(Spacebars.dot(view.lookup("bar"), "baz"));
  }, function() {
    return Spacebars.include(view.lookupTemplate("foo"));
  });
}));

Template.__define__("old_spacebars_template_test_inclusion_slashed_args", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return Spacebars.call(Spacebars.dot(view.lookup("bar"), "baz"));
  }, function() {
    return Spacebars.include(view.lookupTemplate("foo"));
  });
}));

Template.__define__("old_spacebars_template_test_block_helper", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("foo"), function() {
    return "\n    bar\n  ";
  }, function() {
    return "\n    baz\n  ";
  });
}));

Template.__define__("old_spacebars_template_test_block_helper_function_one_string_arg", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return "bar";
  }, function() {
    return Spacebars.include(view.lookupTemplate("foo"), function() {
      return "\n    content\n  ";
    });
  });
}));

Template.__define__("old_spacebars_template_test_block_helper_function_one_helper_arg", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return Spacebars.call(view.lookup("bar"));
  }, function() {
    return Spacebars.include(view.lookupTemplate("foo"), function() {
      return "\n    content\n  ";
    });
  });
}));

Template.__define__("old_spacebars_template_test_block_helper_component_one_helper_arg", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("bar"));
  }, function() {
    return "\n    content\n  ";
  });
}));

Template.__define__("old_spacebars_template_test_block_helper_component_three_helper_args", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.dataMustache(view.lookup("equals"), view.lookup("bar_or_baz"), "bar");
  }, function() {
    return "\n    content\n  ";
  });
}));

Template.__define__("old_spacebars_template_test_block_helper_dotted_arg", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return Spacebars.dataMustache(Spacebars.dot(view.lookup("bar"), "baz"), view.lookup("qux"));
  }, function() {
    return Spacebars.include(view.lookupTemplate("foo"), function() {
      return null;
    });
  });
}));

Template.__define__("old_spacebars_template_test_nested_content", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return {
      condition: Spacebars.call(view.lookup("flag"))
    };
  }, function() {
    return Spacebars.include(view.lookupTemplate("old_spacebars_template_test_iftemplate"), function() {
      return "\n    hello\n  ";
    }, function() {
      return "\n    world\n  ";
    });
  });
}));

Template.__define__("old_spacebars_template_test_iftemplate2", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return {
      condition: Spacebars.call(view.lookup("flag"))
    };
  }, function() {
    return Spacebars.include(view.lookupTemplate("old_spacebars_template_test_iftemplate"), function() {
      return [ "\n    ", Blaze.InOuterTemplateScope(view, function() {
        return Spacebars.include(function() {
          return Spacebars.call(view.templateContentBlock);
        });
      }), "\n  " ];
    }, function() {
      return [ "\n    ", Blaze.InOuterTemplateScope(view, function() {
        return Spacebars.include(function() {
          return Spacebars.call(view.templateElseBlock);
        });
      }), "\n  " ];
    });
  });
}));

Template.__define__("old_spacebars_template_test_nested_content2", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return {
      flag: Spacebars.call(view.lookup("x"))
    };
  }, function() {
    return Spacebars.include(view.lookupTemplate("old_spacebars_template_test_iftemplate2"), function() {
      return "\n    hello\n  ";
    }, function() {
      return "\n    world\n  ";
    });
  });
}));

Template.__define__("old_spacebars_template_test_if", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("bar"));
    }), "\n  " ];
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("baz"));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_if_in_with", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("bar"));
    }), "\n    ", Blaze.If(function() {
      return true;
    }, function() {
      return [ "\n      ", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("bar"));
      }), "\n    " ];
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_each", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("items"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("text"));
    }), "\n  " ];
  }, function() {
    return "\n    else-clause\n  ";
  });
}));

Template.__define__("old_spacebars_template_test_dots", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n    A\n    ", Spacebars.With(function() {
      return Spacebars.call(view.lookup("bar"));
    }, function() {
      return [ "\n      B\n      \n      ", Blaze.If(function() {
        return true;
      }, function() {
        return [ "\n        C\n        ", Blaze.Each(function() {
          return Spacebars.call(view.lookup("items"));
        }, function() {
          return [ "\n          D\n          \n          ", Spacebars.include(view.lookupTemplate("old_spacebars_template_test_dots_subtemplate")), "\n          ", Spacebars.TemplateWith(function() {
            return Spacebars.call(view.lookup(".."));
          }, function() {
            return Spacebars.include(view.lookupTemplate("old_spacebars_template_test_dots_subtemplate"));
          }), "\n        " ];
        }), "\n      " ];
      }), "\n    " ];
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_dots_subtemplate", (function() {
  var view = this;
  return [ "TITLE\n  1", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("title"));
  }), "\n  2", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("."), "title"));
  }), "\n  3", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup(".."), "title"));
  }), "\n  4", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("..."), "title"));
  }), "\n\n  GETTITLE\n  5", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("getTitle"), view.lookup("."));
  }), "\n  6", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("getTitle"), view.lookup(".."));
  }), "\n  7", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("getTitle"), view.lookup("..."));
  }) ];
}));

Template.__define__("old_spacebars_template_test_select_tag", (function() {
  var view = this;
  return HTML.SELECT("\n    ", Blaze.Each(function() {
    return Spacebars.call(view.lookup("optgroups"));
  }, function() {
    return [ "\n      ", HTML.OPTGROUP({
      label: function() {
        return Spacebars.mustache(view.lookup("label"));
      }
    }, "\n        ", Blaze.Each(function() {
      return Spacebars.call(view.lookup("options"));
    }, function() {
      return [ "\n          ", HTML.OPTION(HTML.Attrs({
        value: function() {
          return Spacebars.mustache(view.lookup("value"));
        }
      }, function() {
        return Spacebars.attrMustache(view.lookup("selectedAttr"));
      }), Blaze.View(function() {
        return Spacebars.mustache(view.lookup("label"));
      })), "\n        " ];
    }), "\n      "), "\n    " ];
  }), "\n  ");
}));

Template.__define__("old_test_template_issue770", (function() {
  var view = this;
  return [ Spacebars.With(function() {
    return Spacebars.call(view.lookup("value1"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    }), "\n  " ];
  }, function() {
    return "\n    xxx\n  ";
  }), "\n\n  ", Spacebars.With(function() {
    return Spacebars.call(view.lookup("value2"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    }), "\n  " ];
  }, function() {
    return "\n    xxx\n  ";
  }), "\n\n  ", Spacebars.With(function() {
    return Spacebars.call(view.lookup("value1"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    }), "\n  " ];
  }), "\n\n  ", Spacebars.With(function() {
    return Spacebars.call(view.lookup("value2"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    }), "\n  " ];
  }) ];
}));

Template.__define__("old_spacebars_template_test_tricky_attrs", (function() {
  var view = this;
  return [ HTML.INPUT({
    type: function() {
      return Spacebars.mustache(view.lookup("theType"));
    }
  }), HTML.INPUT({
    type: "checkbox",
    "class": function() {
      return Spacebars.mustache(view.lookup("theClass"));
    }
  }) ];
}));

Template.__define__("old_spacebars_template_test_no_data", (function() {
  var view = this;
  return [ Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("."), "foo"));
  }), Blaze.Unless(function() {
    return Spacebars.call(Spacebars.dot(view.lookup("."), "bar"));
  }, function() {
    return "asdf";
  }) ];
}));

Template.__define__("old_spacebars_template_test_textarea", (function() {
  var view = this;
  return HTML.TEXTAREA({
    value: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  });
}));

Template.__define__("old_spacebars_template_test_textarea2", (function() {
  var view = this;
  return HTML.TEXTAREA({
    value: function() {
      return Blaze.If(function() {
        return Spacebars.call(view.lookup("foo"));
      }, function() {
        return "</not a tag>";
      }, function() {
        return "<also not a tag>";
      });
    }
  });
}));

Template.__define__("old_spacebars_template_test_textarea3", (function() {
  var view = this;
  return HTML.TEXTAREA({
    id: "myTextarea",
    value: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  });
}));

Template.__define__("old_spacebars_template_test_textarea_each", (function() {
  var view = this;
  return HTML.TEXTAREA({
    value: function() {
      return Blaze.Each(function() {
        return Spacebars.call(view.lookup("foo"));
      }, function() {
        return [ "<not a tag ", Blaze.View(function() {
          return Spacebars.mustache(view.lookup("."));
        }), " " ];
      }, function() {
        return "<>";
      });
    }
  });
}));

Template.__define__("old_spacebars_template_test_defer_in_rendered", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("items"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_template_test_defer_in_rendered_subtemplate")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_defer_in_rendered_subtemplate", (function() {
  var view = this;
  return "";
}));

Template.__define__("old_spacebars_template_test_with_someData", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("someData"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("foo"));
    }), " ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("bar"));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_each_stops", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("items"));
  }, function() {
    return "\n    x\n  ";
  });
}));

Template.__define__("old_spacebars_template_test_block_helpers_in_attribute", (function() {
  var view = this;
  return HTML.DIV({
    "class": function() {
      return Blaze.Each(function() {
        return Spacebars.call(view.lookup("classes"));
      }, function() {
        return Blaze.If(function() {
          return Spacebars.dataMustache(view.lookup("startsLowerCase"), view.lookup("name"));
        }, function() {
          return [ Blaze.View(function() {
            return Spacebars.mustache(view.lookup("name"));
          }), " " ];
        });
      }, function() {
        return "none";
      });
    }
  }, "Smurf");
}));

Template.__define__("old_spacebars_template_test_block_helpers_in_attribute_2", (function() {
  var view = this;
  return HTML.INPUT({
    value: function() {
      return Blaze.If(function() {
        return Spacebars.call(view.lookup("foo"));
      }, function() {
        return '"';
      }, function() {
        return [ "&", HTML.CharRef({
          html: "&lt;",
          str: "<"
        }), "></x>" ];
      });
    }
  });
}));

Template.__define__("old_spacebars_template_test_constant_each_argument", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("someData"));
  }, function() {
    return [ "\n    ", Blaze.Each(function() {
      return Spacebars.call(view.lookup("anArray"));
    }, function() {
      return [ "\n      ", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("justReturn"), view.lookup("."));
      }), "\n    " ];
    }), "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_markdown_basic", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("obj"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("markdown"), function() {
      return [ "\n", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("hi"));
      }), "\n/each}}\n\n<b>", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("hi"));
      }), "</b>\n<b>/each}}</b>\n\n* ", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("hi"));
      }), "\n* /each}}\n\n* <b>", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("hi"));
      }), "</b>\n* <b>/each}}</b>\n\nsome paragraph to fix showdown's four space parsing below.\n\n    ", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("hi"));
      }), "\n    /each}}\n\n    <b>", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("hi"));
      }), "</b>\n    <b>/each}}</b>\n\n&gt\n\n* &gt\n\n`&gt`\n\n    &gt\n\n&gt;\n\n* &gt;\n\n`&gt;`\n\n    &gt;\n\n`", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("hi"));
      }), "`\n`/each}}`\n\n`<b>", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("hi"));
      }), "</b>`\n`<b>/each}}`\n\n    " ];
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_markdown_if", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("markdown"), function() {
    return [ "\n\n", Blaze.If(function() {
      return Spacebars.call(view.lookup("cond"));
    }, function() {
      return "true";
    }, function() {
      return "false";
    }), "\n\n<b>", Blaze.If(function() {
      return Spacebars.call(view.lookup("cond"));
    }, function() {
      return "true";
    }, function() {
      return "false";
    }), "</b>\n\n* ", Blaze.If(function() {
      return Spacebars.call(view.lookup("cond"));
    }, function() {
      return "true";
    }, function() {
      return "false";
    }), "\n\n* <b>", Blaze.If(function() {
      return Spacebars.call(view.lookup("cond"));
    }, function() {
      return "true";
    }, function() {
      return "false";
    }), "</b>\n\nsome paragraph to fix showdown's four space parsing below.\n\n    ", Blaze.If(function() {
      return Spacebars.call(view.lookup("cond"));
    }, function() {
      return "true";
    }, function() {
      return "false";
    }), "\n\n    <b>", Blaze.If(function() {
      return Spacebars.call(view.lookup("cond"));
    }, function() {
      return "true";
    }, function() {
      return "false";
    }), "</b>\n\n`", Blaze.If(function() {
      return Spacebars.call(view.lookup("cond"));
    }, function() {
      return "true";
    }, function() {
      return "false";
    }), "`\n\n`<b>", Blaze.If(function() {
      return Spacebars.call(view.lookup("cond"));
    }, function() {
      return "true";
    }, function() {
      return "false";
    }), "</b>`\n\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_markdown_each", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("markdown"), function() {
    return [ "\n\n", Blaze.Each(function() {
      return Spacebars.call(view.lookup("seq"));
    }, function() {
      return Blaze.View(function() {
        return Spacebars.mustache(view.lookup("."));
      });
    }), "\n\n<b>", Blaze.Each(function() {
      return Spacebars.call(view.lookup("seq"));
    }, function() {
      return Blaze.View(function() {
        return Spacebars.mustache(view.lookup("."));
      });
    }), "</b>\n\n* ", Blaze.Each(function() {
      return Spacebars.call(view.lookup("seq"));
    }, function() {
      return Blaze.View(function() {
        return Spacebars.mustache(view.lookup("."));
      });
    }), "\n\n* <b>", Blaze.Each(function() {
      return Spacebars.call(view.lookup("seq"));
    }, function() {
      return Blaze.View(function() {
        return Spacebars.mustache(view.lookup("."));
      });
    }), "</b>\n\nsome paragraph to fix showdown's four space parsing below.\n\n    ", Blaze.Each(function() {
      return Spacebars.call(view.lookup("seq"));
    }, function() {
      return Blaze.View(function() {
        return Spacebars.mustache(view.lookup("."));
      });
    }), "\n\n    <b>", Blaze.Each(function() {
      return Spacebars.call(view.lookup("seq"));
    }, function() {
      return Blaze.View(function() {
        return Spacebars.mustache(view.lookup("."));
      });
    }), "</b>\n\n`", Blaze.Each(function() {
      return Spacebars.call(view.lookup("seq"));
    }, function() {
      return Blaze.View(function() {
        return Spacebars.mustache(view.lookup("."));
      });
    }), "`\n\n`<b>", Blaze.Each(function() {
      return Spacebars.call(view.lookup("seq"));
    }, function() {
      return Blaze.View(function() {
        return Spacebars.mustache(view.lookup("."));
      });
    }), "</b>`\n\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_markdown_inclusion", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("markdown"), function() {
    return [ "\n", Spacebars.include(view.lookupTemplate("old_spacebars_template_test_markdown_inclusion_subtmpl")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_markdown_inclusion_subtmpl", (function() {
  var view = this;
  return HTML.SPAN(Blaze.If(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "Foo is ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("foo"));
    }), "." ];
  }));
}));

Template.__define__("old_spacebars_template_test_markdown_block_helpers", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("markdown"), function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_template_test_just_content"), function() {
      return "\nHi there!\n    ";
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_just_content", (function() {
  var view = this;
  return Blaze.InOuterTemplateScope(view, function() {
    return Spacebars.include(function() {
      return Spacebars.call(view.templateContentBlock);
    });
  });
}));

Template.__define__("old_spacebars_template_test_simple_helpers_are_isolated", (function() {
  var view = this;
  return Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"));
  });
}));

Template.__define__("old_spacebars_template_test_attr_helpers_are_isolated", (function() {
  var view = this;
  return HTML.P({
    attr: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  });
}));

Template.__define__("old_spacebars_template_test_attr_object_helpers_are_isolated", (function() {
  var view = this;
  return HTML.P(HTML.Attrs(function() {
    return Spacebars.attrMustache(view.lookup("attrs"));
  }));
}));

Template.__define__("old_spacebars_template_test_inclusion_helpers_are_isolated", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("foo"));
}));

Template.__define__("old_spacebars_template_test_inclusion_helpers_are_isolated_subtemplate", (function() {
  var view = this;
  return "";
}));

Template.__define__("old_spacebars_template_test_nully_attributes0", (function() {
  var view = this;
  return HTML.Raw('<input type="checkbox" checked="" stuff="">');
}));

Template.__define__("old_spacebars_template_test_nully_attributes1", (function() {
  var view = this;
  return HTML.INPUT({
    type: "checkbox",
    checked: function() {
      return Spacebars.mustache(view.lookup("foo"));
    },
    stuff: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  });
}));

Template.__define__("old_spacebars_template_test_nully_attributes2", (function() {
  var view = this;
  return HTML.INPUT({
    type: "checkbox",
    checked: function() {
      return [ Spacebars.mustache(view.lookup("foo")), Spacebars.mustache(view.lookup("bar")) ];
    },
    stuff: function() {
      return [ Spacebars.mustache(view.lookup("foo")), Spacebars.mustache(view.lookup("bar")) ];
    }
  });
}));

Template.__define__("old_spacebars_template_test_nully_attributes3", (function() {
  var view = this;
  return HTML.INPUT({
    type: "checkbox",
    checked: function() {
      return Blaze.If(function() {
        return Spacebars.call(view.lookup("foo"));
      }, function() {
        return null;
      });
    },
    stuff: function() {
      return Blaze.If(function() {
        return Spacebars.call(view.lookup("foo"));
      }, function() {
        return null;
      });
    }
  });
}));

Template.__define__("old_spacebars_template_test_double", (function() {
  var view = this;
  return Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"));
  });
}));

Template.__define__("old_spacebars_template_test_inclusion_lookup", (function() {
  var view = this;
  return [ Spacebars.include(view.lookupTemplate("old_spacebars_template_test_inclusion_lookup_subtmpl")), "\n  ", Spacebars.include(view.lookupTemplate("dataContextSubtmpl")) ];
}));

Template.__define__("old_spacebars_template_test_inclusion_lookup_subtmpl", (function() {
  var view = this;
  return "This is the template.";
}));

Template.__define__("old_spacebars_template_test_inclusion_lookup_subtmpl2", (function() {
  var view = this;
  return "This is generated by a helper with the same name.";
}));

Template.__define__("old_spacebars_template_test_inclusion_lookup_subtmpl3", (function() {
  var view = this;
  return "This is a template passed in the data context.";
}));

Template.__define__("old_spacebars_template_test_content_context", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n    ", Spacebars.With(function() {
      return Spacebars.call(view.lookup("bar"));
    }, function() {
      return [ "\n      ", Spacebars.TemplateWith(function() {
        return {
          condition: Spacebars.call(view.lookup("cond"))
        };
      }, function() {
        return Spacebars.include(view.lookupTemplate("old_spacebars_template_test_iftemplate"), function() {
          return [ "\n        ", Blaze.View(function() {
            return Spacebars.mustache(view.lookup("firstLetter"));
          }), Blaze.View(function() {
            return Spacebars.mustache(Spacebars.dot(view.lookup(".."), "secondLetter"));
          }), "\n      " ];
        }, function() {
          return [ "\n        ", Blaze.View(function() {
            return Spacebars.mustache(Spacebars.dot(view.lookup(".."), "firstLetter"));
          }), Blaze.View(function() {
            return Spacebars.mustache(view.lookup("secondLetter"));
          }), "\n      " ];
        });
      }), "\n    " ];
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_control_input", (function() {
  var view = this;
  return HTML.INPUT({
    type: function() {
      return Spacebars.mustache(view.lookup("type"));
    },
    value: function() {
      return Spacebars.mustache(view.lookup("value"));
    }
  });
}));

Template.__define__("old_spacebars_test_control_textarea", (function() {
  var view = this;
  return HTML.TEXTAREA({
    value: function() {
      return Spacebars.mustache(view.lookup("value"));
    }
  });
}));

Template.__define__("old_spacebars_test_control_select", (function() {
  var view = this;
  return HTML.SELECT("\n    ", Blaze.Each(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return [ "\n      ", HTML.OPTION({
      selected: function() {
        return Spacebars.mustache(view.lookup("selected"));
      }
    }, Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    })), "\n    " ];
  }), "\n  ");
}));

Template.__define__("old_spacebars_test_control_radio", (function() {
  var view = this;
  return [ "Band:\n\n  ", Blaze.Each(function() {
    return Spacebars.call(view.lookup("bands"));
  }, function() {
    return [ "\n    ", HTML.INPUT({
      name: "bands",
      type: "radio",
      value: function() {
        return Spacebars.mustache(view.lookup("."));
      },
      checked: function() {
        return Spacebars.mustache(view.lookup("isChecked"));
      }
    }), "\n  " ];
  }), "\n\n  ", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("band"));
  }) ];
}));

Template.__define__("old_spacebars_test_control_checkbox", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("labels"));
  }, function() {
    return [ "\n    ", HTML.INPUT({
      type: "checkbox",
      value: function() {
        return Spacebars.mustache(view.lookup("."));
      },
      checked: function() {
        return Spacebars.mustache(view.lookup("isChecked"));
      }
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_nonexistent_template", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("this_template_lives_in_outer_space"));
}));

Template.__define__("old_spacebars_test_if_helper", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return "\n    true\n  ";
  }, function() {
    return "\n    false\n  ";
  });
}));

Template.__define__("old_spacebars_test_block_helper_function", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("foo"), function() {
    return "\n  ";
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_onetwo", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("showOne"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("one")), "\n  " ];
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("two")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_onetwo_attribute", (function() {
  var view = this;
  return HTML.BR({
    "data-stuff": function() {
      return Blaze.If(function() {
        return Spacebars.call(view.lookup("showOne"));
      }, function() {
        return [ "\n    ", Spacebars.include(view.lookupTemplate("one")), "\n  " ];
      }, function() {
        return [ "\n    ", Spacebars.include(view.lookupTemplate("two")), "\n  " ];
      });
    }
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_with1", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return "\n    one\n  ";
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_with2", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return "\n    two\n  ";
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_each1", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return "\n    one\n  ";
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_each2", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return "\n    two\n  ";
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_with_each1", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_test_helpers_stop_with_each3")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_with_each2", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_test_helpers_stop_with_each3")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_with_each3", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("."));
  }, function() {
    return "\n  ";
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_if1", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return "\n    one\n  ";
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_if2", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return "\n    two\n  ";
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_inclusion1", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("options"));
}));

Template.__define__("old_spacebars_test_helpers_stop_inclusion2", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("options"));
}));

Template.__define__("old_spacebars_test_helpers_stop_inclusion3", (function() {
  var view = this;
  return "blah";
}));

Template.__define__("old_spacebars_test_helpers_stop_with_callbacks1", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_test_helpers_stop_with_callbacks3")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_with_callbacks2", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_test_helpers_stop_with_callbacks3")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_with_callbacks3", (function() {
  var view = this;
  return "blah";
}));

Template.__define__("old_spacebars_test_helpers_stop_unless1", (function() {
  var view = this;
  return Blaze.Unless(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return "\n    one\n  ";
  });
}));

Template.__define__("old_spacebars_test_helpers_stop_unless2", (function() {
  var view = this;
  return Blaze.Unless(function() {
    return Spacebars.call(view.lookup("options"));
  }, function() {
    return "\n    two\n  ";
  });
}));

Template.__define__("old_spacebars_test_no_data_context", (function() {
  var view = this;
  return [ HTML.Raw("<button></button>\n  "), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"));
  }) ];
}));

Template.__define__("old_spacebars_test_falsy_with", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("obj"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("greekLetter"));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_helpers_dont_leak", (function() {
  var view = this;
  return Spacebars.TemplateWith(function() {
    return {
      foo: Spacebars.call("correct")
    };
  }, function() {
    return Spacebars.include(view.lookupTemplate("old_spacebars_test_helpers_dont_leak2"));
  });
}));

Template.__define__("old_spacebars_test_helpers_dont_leak2", (function() {
  var view = this;
  return [ Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("bar"));
  }), " ", Spacebars.include(view.lookupTemplate("old_spacebars_template_test_content"), function() {
    return Blaze.View(function() {
      return Spacebars.mustache(view.lookup("bonus"));
    });
  }) ];
}));

Template.__define__("old_spacebars_test_event_returns_false", (function() {
  var view = this;
  return HTML.Raw('<a href="#bad-url" id="spacebars_test_event_returns_false_link">click me</a>');
}));

Template.__define__("old_spacebars_test_event_selectors1", (function() {
  var view = this;
  return HTML.DIV(Spacebars.include(view.lookupTemplate("old_spacebars_test_event_selectors2")));
}));

Template.__define__("old_spacebars_test_event_selectors2", (function() {
  var view = this;
  return HTML.Raw('<p class="p1">Not it</p>\n  <div><p class="p2">It</p></div>');
}));

Template.__define__("old_spacebars_test_event_selectors_capturing1", (function() {
  var view = this;
  return HTML.DIV(Spacebars.include(view.lookupTemplate("old_spacebars_test_event_selectors_capturing2")));
}));

Template.__define__("old_spacebars_test_event_selectors_capturing2", (function() {
  var view = this;
  return HTML.Raw('<video class="video1">\n    <source id="mp4" src="http://media.w3.org/2010/05/sintel/trailer.mp4" type="video/mp4">\n  </video>\n  <div>\n    <video class="video2">\n      <source id="mp4" src="http://media.w3.org/2010/05/sintel/trailer.mp4" type="video/mp4">\n    </video>\n  </div>');
}));

Template.__define__("old_spacebars_test_tables1", (function() {
  var view = this;
  return HTML.TABLE(HTML.TR(HTML.TD("Foo")));
}));

Template.__define__("old_spacebars_test_tables2", (function() {
  var view = this;
  return HTML.TABLE(HTML.TR(HTML.TD(Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"));
  }))));
}));

Template.__define__("old_spacebars_test_jquery_events", (function() {
  var view = this;
  return HTML.Raw('<button type="button">button</button>');
}));

Template.__define__("old_spacebars_test_tohtml_basic", (function() {
  var view = this;
  return Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"));
  });
}));

Template.__define__("old_spacebars_test_tohtml_if", (function() {
  var view = this;
  return Blaze.If(function() {
    return true;
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("foo"));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_tohtml_with", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_tohtml_each", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("foos"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_tohtml_include_with", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("old_spacebars_test_tohtml_with"));
}));

Template.__define__("old_spacebars_test_tohtml_include_each", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("old_spacebars_test_tohtml_each"));
}));

Template.__define__("old_spacebars_test_block_comment", (function() {
  var view = this;
  return "\n  ";
}));

Template.__define__("old_spacebars_test_with_mutated_data_context", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("value"));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_url_attribute", (function() {
  var view = this;
  return [ HTML.A({
    href: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  }), "\n  ", HTML.A({
    href: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  }), "\n  ", HTML.FORM({
    action: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  }), "\n  ", HTML.IMG({
    src: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  }), "\n  ", HTML.INPUT({
    value: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  }) ];
}));

Template.__define__("old_spacebars_test_event_handler_cleanup", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_test_event_handler_cleanup_sub")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_event_handler_cleanup_sub", (function() {
  var view = this;
  return HTML.Raw("<div></div>");
}));

Template.__define__("old_spacebars_test_data_context_for_event_handler_in_if", (function() {
  var view = this;
  return Spacebars.With(function() {
    return {
      foo: Spacebars.call("bar")
    };
  }, function() {
    return [ "\n    ", Blaze.If(function() {
      return true;
    }, function() {
      return [ "\n      ", HTML.SPAN("Click me!"), "\n    " ];
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_each_with_autorun_insert", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("items"));
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("name"));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_ui_hooks", (function() {
  var view = this;
  return HTML.DIV({
    "class": "test-ui-hooks"
  }, "\n    ", Blaze.Each(function() {
    return Spacebars.call(view.lookup("items"));
  }, function() {
    return [ "\n      ", HTML.DIV({
      "class": "item"
    }, Blaze.View(function() {
      return Spacebars.mustache(view.lookup("_id"));
    })), "\n    " ];
  }), "\n  ");
}));

Template.__define__("old_spacebars_test_ui_hooks_nested", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_test_ui_hooks_nested_sub")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_ui_hooks_nested_sub", (function() {
  var view = this;
  return HTML.DIV("\n    ", Spacebars.With(function() {
    return true;
  }, function() {
    return [ "\n      ", HTML.P("hello"), "\n    " ];
  }), "\n  ");
}));

Template.__define__("old_spacebars_test_template_instance_helper", (function() {
  var view = this;
  return Spacebars.With(function() {
    return true;
  }, function() {
    return Blaze.View(function() {
      return Spacebars.mustache(view.lookup("foo"));
    });
  });
}));

Template.__define__("old_spacebars_test_with_cleanup", (function() {
  var view = this;
  return HTML.DIV({
    "class": "test-with-cleanup"
  }, "\n    ", Spacebars.With(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n      ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    }), "\n    " ];
  }), "\n  ");
}));

Template.__define__("old_spacebars_test_template_parent_data_helper", (function() {
  var view = this;
  return Spacebars.With(function() {
    return "parent";
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_test_template_parent_data_helper_child")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_template_parent_data_helper_child", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("a"));
  }, function() {
    return [ "\n    ", Spacebars.With(function() {
      return Spacebars.call(view.lookup("b"));
    }, function() {
      return [ "\n      ", Blaze.If(function() {
        return Spacebars.call(view.lookup("c"));
      }, function() {
        return [ "\n        ", Spacebars.With(function() {
          return "d";
        }, function() {
          return [ "\n          ", Blaze.View(function() {
            return Spacebars.mustache(view.lookup("foo"));
          }), "\n        " ];
        }), "\n      " ];
      }), "\n    " ];
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_svg_anchor", (function() {
  var view = this;
  return HTML.SVG("\n    ", HTML.A({
    "xlink:href": "http://www.example.com"
  }, "Foo"), "\n  ");
}));

Template.__define__("old_spacebars_test_template_created_rendered_destroyed_each", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("items"));
  }, function() {
    return [ "\n    ", HTML.DIV(Spacebars.TemplateWith(function() {
      return Spacebars.call(view.lookup("_id"));
    }, function() {
      return Spacebars.include(view.lookupTemplate("old_spacebars_test_template_created_rendered_destroyed_each_sub"));
    })), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_template_created_rendered_destroyed_each_sub", (function() {
  var view = this;
  return Blaze.View(function() {
    return Spacebars.mustache(view.lookup("."));
  });
}));

Template.__define__("old_spacebars_test_ui_getElementData", (function() {
  var view = this;
  return HTML.Raw("<span></span>");
}));

Template.__define__("old_spacebars_test_ui_render", (function() {
  var view = this;
  return HTML.SPAN(Blaze.View(function() {
    return Spacebars.mustache(view.lookup("greeting"));
  }), " ", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("r"));
  }));
}));

Template.__define__("old_spacebars_test_parent_removal", (function() {
  var view = this;
  return HTML.DIV({
    "class": "a"
  }, "\n    ", HTML.DIV({
    "class": "b"
  }, "\n      ", HTML.DIV({
    "class": "toremove"
  }, "\n        ", HTML.DIV({
    "class": "c"
  }, "\n          ", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("A"), 1);
  }), "\n          ", Blaze.View(function() {
    return Spacebars.makeRaw(Spacebars.mustache(view.lookup("A"), 2));
  }), "\n          ", Spacebars.With(function() {
    return Spacebars.dataMustache(view.lookup("A"), 3);
  }, function() {
    return [ "\n            ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("A"), 4);
    }), "\n            ", Spacebars.With(function() {
      return Spacebars.dataMustache(view.lookup("A"), 5);
    }, function() {
      return [ "\n              ", Blaze.View(function() {
        return Spacebars.mustache(view.lookup("A"), 6);
      }), "\n            " ];
    }), "\n          " ];
  }), "\n          ", Blaze.Each(function() {
    return Spacebars.call(view.lookup("B"));
  }, function() {
    return [ "\n            ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("A"), 7);
    }), "\n          " ];
  }), "\n          ", Blaze.If(function() {
    return Spacebars.dataMustache(view.lookup("A"), 8);
  }, function() {
    return [ "\n            ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("A"), 9);
    }), "\n          " ];
  }, function() {
    return [ "\n            ", Blaze.View(function() {
      return Spacebars.mustache(view.lookup("A"), "a");
    }), "\n          " ];
  }), "\n        "), "\n      "), "\n    "), "\n  ");
}));

Template.__define__("old_spacebars_test_focus_blur_outer", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("cond"));
  }, function() {
    return [ "\n    a ", Spacebars.include(view.lookupTemplate("old_spacebars_test_focus_blur_inner")), "\n  " ];
  }, function() {
    return [ "\n    b ", Spacebars.include(view.lookupTemplate("old_spacebars_test_focus_blur_inner")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_focus_blur_inner", (function() {
  var view = this;
  return HTML.Raw('<input type="text">');
}));

Template.__define__("old_spacebars_test_event_cleanup_on_destroyed_outer", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("cond"));
  }, function() {
    return [ "\n    ", HTML.DIV("a ", Spacebars.include(view.lookupTemplate("old_spacebars_test_event_cleanup_on_destroyed_inner"))), "\n  " ];
  }, function() {
    return [ "\n    ", HTML.DIV("b ", Spacebars.include(view.lookupTemplate("old_spacebars_test_event_cleanup_on_destroyed_inner"))), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_event_cleanup_on_destroyed_inner", (function() {
  var view = this;
  return HTML.Raw("<span>foo</span>");
}));

Template.__define__("old_spacebars_test_isolated_lookup_inclusion", (function() {
  var view = this;
  return "x";
}));

Template.__define__("old_spacebars_test_isolated_lookup1", (function() {
  var view = this;
  return [ Spacebars.include(view.lookupTemplate("foo")), "--", Spacebars.include(view.lookupTemplate("old_spacebars_test_isolated_lookup_inclusion")) ];
}));

Template.__define__("old_spacebars_test_isolated_lookup2", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n    ", Spacebars.With(function() {
      return {
        z: Spacebars.call(1)
      };
    }, function() {
      return [ "\n      ", Spacebars.include(view.lookupTemplate("..")), "--", Spacebars.include(view.lookupTemplate("old_spacebars_test_isolated_lookup_inclusion")), "\n    " ];
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_isolated_lookup3", (function() {
  var view = this;
  return [ Spacebars.include(view.lookupTemplate("bar")), "--", Spacebars.include(view.lookupTemplate("old_spacebars_test_isolated_lookup_inclusion")) ];
}));

Template.__define__("old_spacebars_test_current_view_in_event", (function() {
  var view = this;
  return HTML.SPAN(Blaze.View(function() {
    return Spacebars.mustache(view.lookup("."));
  }));
}));

Template.__define__("old_spacebars_test_textarea_attrs", (function() {
  var view = this;
  return HTML.TEXTAREA(HTML.Attrs(function() {
    return Spacebars.attrMustache(view.lookup("attrs"));
  }));
}));

Template.__define__("old_spacebars_test_textarea_attrs_contents", (function() {
  var view = this;
  return HTML.TEXTAREA(HTML.Attrs(function() {
    return Spacebars.attrMustache(view.lookup("attrs"));
  }, {
    value: function() {
      return [ "Hello ", Spacebars.mustache(view.lookup("name")) ];
    }
  }));
}));

Template.__define__("old_spacebars_test_textarea_attrs_array_contents", (function() {
  var view = this;
  return HTML.TEXTAREA(HTML.Attrs({
    "class": "bar"
  }, function() {
    return Spacebars.attrMustache(view.lookup("attrs"));
  }, {
    value: function() {
      return [ "Hello ", Spacebars.mustache(view.lookup("name")) ];
    }
  }));
}));

Template.__define__("old_spacebars_test_autorun", (function() {
  var view = this;
  return Blaze.If(function() {
    return Spacebars.call(view.lookup("show"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("old_spacebars_test_autorun_inner")), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_autorun_inner", (function() {
  var view = this;
  return "Hello";
}));

Template.__define__("old_spacebars_test_contentBlock_arg", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("old_spacebars_test_contentBlock_arg_inner"), function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(Spacebars.dot(view.lookup("."), "bar"));
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_test_contentBlock_arg_inner", (function() {
  var view = this;
  return Spacebars.With(function() {
    return {
      foo: Spacebars.call("AAA"),
      bar: Spacebars.call("BBB")
    };
  }, function() {
    return [ "\n    ", Blaze.View(function() {
      return Spacebars.mustache(Spacebars.dot(view.lookup("."), "foo"));
    }), " ", Blaze.InOuterTemplateScope(view, function() {
      return Spacebars.TemplateWith(function() {
        return Spacebars.call(view.lookup("."));
      }, function() {
        return Spacebars.include(function() {
          return Spacebars.call(view.templateContentBlock);
        });
      });
    }), "\n  " ];
  });
}));

Template.__define__("old_spacebars_template_test_input_field_to_same_value", (function() {
  var view = this;
  return HTML.INPUT({
    type: "text",
    value: function() {
      return Spacebars.mustache(view.lookup("foo"));
    }
  });
}));

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


Template.__define__("old_test_assembly_a0", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("test_assembly_a1"));
}));

Template.__define__("old_test_assembly_a1", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("test_assembly_a2"));
}));

Template.__define__("old_test_assembly_a2", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("test_assembly_a3"));
}));

Template.__define__("old_test_assembly_a3", (function() {
  var view = this;
  return "Hi";
}));

Template.__define__("old_test_assembly_b0", (function() {
  var view = this;
  return Spacebars.include(view.lookupTemplate("test_assembly_b1"));
}));

Template.__define__("old_test_assembly_b1", (function() {
  var view = this;
  return [ "x", Blaze.If(function() {
    return Spacebars.call(view.lookup("stuff"));
  }, function() {
    return "y";
  }), Spacebars.include(view.lookupTemplate("test_assembly_b2")) ];
}));

Template.__define__("old_test_assembly_b2", (function() {
  var view = this;
  return "hi";
}));

Template.__define__("old_test_table_b0", (function() {
  var view = this;
  return HTML.TABLE("\n    ", HTML.TBODY("\n      ", Spacebars.include(view.lookupTemplate("test_table_b1")), "\n      ", Spacebars.include(view.lookupTemplate("test_table_b1")), "\n      ", Spacebars.include(view.lookupTemplate("test_table_b1")), "\n    "), "\n  ");
}));

Template.__define__("old_test_table_b1", (function() {
  var view = this;
  return HTML.TR("\n    ", Spacebars.include(view.lookupTemplate("test_table_b2")), "\n  ");
}));

Template.__define__("old_test_table_b2", (function() {
  var view = this;
  return HTML.TD("\n    ", Spacebars.include(view.lookupTemplate("test_table_b3")), "\n  ");
}));

Template.__define__("old_test_table_b3", (function() {
  var view = this;
  return "Foo.";
}));

Template.__define__("old_test_table_each", (function() {
  var view = this;
  return HTML.TABLE("\n    ", HTML.TBODY("\n      ", Blaze.Each(function() {
    return Spacebars.call(view.lookup("foo"));
  }, function() {
    return [ "\n        ", HTML.TR(HTML.TD(Blaze.View(function() {
      return Spacebars.mustache(view.lookup("bar"));
    }))), "\n      " ];
  }), "\n    "), "\n  ");
}));

Template.__define__("old_test_event_data_with", (function() {
  var view = this;
  return HTML.DIV("\n  xxx\n  ", Spacebars.With(function() {
    return Spacebars.call(view.lookup("TWO"));
  }, function() {
    return [ "\n    ", HTML.DIV("\n      xxx\n      ", Spacebars.With(function() {
      return Spacebars.call(view.lookup("THREE"));
    }, function() {
      return [ "\n        ", HTML.DIV("\n          xxx\n        "), "\n      " ];
    }), "\n    "), "\n  " ];
  }), "\n");
}));

Template.__define__("old_test_capture_events", (function() {
  var view = this;
  return HTML.Raw('<video class="video1">\n    <source id="mp4" src="" type="video/mp4">\n  </video>\n  <video class="video2">\n    <source id="mp4" src="" type="video/mp4">\n  </video>\n  <video class="video2">\n    <source id="mp4" src="" type="video/mp4">\n  </video>');
}));

Template.__define__("old_test_safestring_a", (function() {
  var view = this;
  return [ Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"));
  }), " ", Blaze.View(function() {
    return Spacebars.makeRaw(Spacebars.mustache(view.lookup("foo")));
  }), " ", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("bar"));
  }), " ", Blaze.View(function() {
    return Spacebars.makeRaw(Spacebars.mustache(view.lookup("bar")));
  }), "\n  ", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("fooprop"));
  }), " ", Blaze.View(function() {
    return Spacebars.makeRaw(Spacebars.mustache(view.lookup("fooprop")));
  }), " ", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("barprop"));
  }), " ", Blaze.View(function() {
    return Spacebars.makeRaw(Spacebars.mustache(view.lookup("barprop")));
  }) ];
}));

Template.__define__("old_test_helpers_a", (function() {
  var view = this;
  return [ "platypus=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("platypus"));
  }), "\n  watermelon=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("watermelon"));
  }), "\n  daisy=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("daisy"));
  }), "\n  tree=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("tree"));
  }), "\n  warthog=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("warthog"));
  }) ];
}));

Template.__define__("old_test_helpers_b", (function() {
  var view = this;
  return [ "unknown=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("unknown"));
  }), "\n  zero=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("zero"));
  }) ];
}));

Template.__define__("old_test_helpers_c", (function() {
  var view = this;
  return [ "platypus.X=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("platypus"), "X"));
  }), "\n  watermelon.X=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("watermelon"), "X"));
  }), "\n  daisy.X=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("daisy"), "X"));
  }), "\n  tree.X=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("tree"), "X"));
  }), "\n  warthog.X=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("warthog"), "X"));
  }), "\n  getNull.X=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("getNull"), "X"));
  }), "\n  getUndefined.X=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("getUndefined"), "X"));
  }), "\n  getUndefined.X.Y=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("getUndefined"), "X", "Y"));
  }) ];
}));

Template.__define__("old_test_helpers_d", (function() {
  var view = this;
  return [ "daisygetter=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("daisygetter"));
  }), "\n  thisTest=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("thisTest"));
  }), "\n  ", Spacebars.With(function() {
    return Spacebars.call(view.lookup("fancy"));
  }, function() {
    return [ "\n    ../thisTest=", Blaze.View(function() {
      return Spacebars.mustache(Spacebars.dot(view.lookup(".."), "thisTest"));
    }), "\n  " ];
  }), "\n  ", Spacebars.With(function() {
    return "foo";
  }, function() {
    return [ "\n    ../fancy.currentFruit=", Blaze.View(function() {
      return Spacebars.mustache(Spacebars.dot(view.lookup(".."), "fancy", "currentFruit"));
    }), "\n  " ];
  }) ];
}));

Template.__define__("old_test_helpers_e", (function() {
  var view = this;
  return [ "fancy.foo=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancy"), "foo"));
  }), "\n  fancy.apple.banana=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancy"), "apple", "banana"));
  }), "\n  fancy.currentFruit=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancy"), "currentFruit"));
  }), "\n  fancy.currentCountry.name=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancy"), "currentCountry", "name"));
  }), "\n  fancy.currentCountry.population=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancy"), "currentCountry", "population"));
  }), "\n  fancy.currentCountry.unicorns=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancy"), "currentCountry", "unicorns"));
  }) ];
}));

Template.__define__("old_test_helpers_f", (function() {
  var view = this;
  return [ "fancyhelper.foo=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancyhelper"), "foo"));
  }), "\n  fancyhelper.apple.banana=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancyhelper"), "apple", "banana"));
  }), "\n  fancyhelper.currentFruit=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancyhelper"), "currentFruit"));
  }), "\n  fancyhelper.currentCountry.name=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancyhelper"), "currentCountry", "name"));
  }), "\n  fancyhelper.currentCountry.population=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancyhelper"), "currentCountry", "population"));
  }), "\n  fancyhelper.currentCountry.unicorns=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("fancyhelper"), "currentCountry", "unicorns"));
  }) ];
}));

Template.__define__("old_test_helpers_g", (function() {
  var view = this;
  return [ "platypus=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("platypus"));
  }), "\n  this.platypus=", Blaze.View(function() {
    return Spacebars.mustache(Spacebars.dot(view.lookup("."), "platypus"));
  }) ];
}));

Template.__define__("old_test_helpers_h", (function() {
  var view = this;
  return [ "(methodListFour 6 7 8 9=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("methodListFour"), 6, 7, 8, 9);
  }), ")\n  (methodListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("methodListFour"), view.lookup("platypus"), view.lookup("thisTest"), Spacebars.dot(view.lookup("fancyhelper"), "currentFruit"), Spacebars.dot(view.lookup("fancyhelper"), "currentCountry", "unicorns"));
  }), ")\n  (methodListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns a=platypus b=thisTest c=fancyhelper.currentFruit d=fancyhelper.currentCountry.unicorns=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("methodListFour"), view.lookup("platypus"), view.lookup("thisTest"), Spacebars.dot(view.lookup("fancyhelper"), "currentFruit"), Spacebars.dot(view.lookup("fancyhelper"), "currentCountry", "unicorns"), Spacebars.kw({
      a: view.lookup("platypus"),
      b: view.lookup("thisTest"),
      c: Spacebars.dot(view.lookup("fancyhelper"), "currentFruit"),
      d: Spacebars.dot(view.lookup("fancyhelper"), "currentCountry", "unicorns")
    }));
  }), ")\n  (helperListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("helperListFour"), view.lookup("platypus"), view.lookup("thisTest"), Spacebars.dot(view.lookup("fancyhelper"), "currentFruit"), Spacebars.dot(view.lookup("fancyhelper"), "currentCountry", "unicorns"));
  }), ")\n  (helperListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns a=platypus b=thisTest c=fancyhelper.currentFruit d=fancyhelper.currentCountry.unicorns=", Blaze.View(function() {
    return Spacebars.mustache(view.lookup("helperListFour"), view.lookup("platypus"), view.lookup("thisTest"), Spacebars.dot(view.lookup("fancyhelper"), "currentFruit"), Spacebars.dot(view.lookup("fancyhelper"), "currentCountry", "unicorns"), Spacebars.kw({
      a: view.lookup("platypus"),
      b: view.lookup("thisTest"),
      c: Spacebars.dot(view.lookup("fancyhelper"), "currentFruit"),
      d: Spacebars.dot(view.lookup("fancyhelper"), "currentCountry", "unicorns")
    }));
  }), ")" ];
}));

Template.__define__("old_test_render_a", (function() {
  var view = this;
  return [ Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"));
  }), HTML.Raw("<br><hr>") ];
}));

Template.__define__("old_test_render_b", (function() {
  var view = this;
  return Spacebars.With(function() {
    return 200;
  }, function() {
    return [ Blaze.View(function() {
      return Spacebars.mustache(view.lookup("foo"));
    }), HTML.BR(), HTML.HR() ];
  });
}));

Template.__define__("old_test_render_c", (function() {
  var view = this;
  return HTML.Raw("<br><hr>");
}));

Template.__define__("old_test_template_arg_a", (function() {
  var view = this;
  return HTML.Raw("<b>Foo</b> <i>Bar</i> <u>Baz</u>");
}));

Template.__define__("old_test_template_helpers_a", (function() {
  var view = this;
  return [ Blaze.View(function() {
    return Spacebars.mustache(view.lookup("foo"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("bar"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("baz"));
  }) ];
}));

Template.__define__("old_test_template_helpers_b", (function() {
  var view = this;
  return [ Blaze.View(function() {
    return Spacebars.mustache(view.lookup("name"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("arity"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("toString"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("length"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("var"));
  }) ];
}));

Template.__define__("old_test_template_helpers_c", (function() {
  var view = this;
  return [ Blaze.View(function() {
    return Spacebars.mustache(view.lookup("name"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("arity"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("length"));
  }), Blaze.View(function() {
    return Spacebars.mustache(view.lookup("var"));
  }), "x" ];
}));

Template.__define__("old_test_template_events_a", (function() {
  var view = this;
  return HTML.Raw("<b>foo</b><u>bar</u><i>baz</i>");
}));

Template.__define__("old_test_template_events_b", (function() {
  var view = this;
  return HTML.Raw("<b>foo</b><u>bar</u><i>baz</i>");
}));

Template.__define__("old_test_template_events_c", (function() {
  var view = this;
  return HTML.Raw("<b>foo</b><u>bar</u><i>baz</i>");
}));

Template.__define__("old_test_type_casting", (function() {
  var view = this;
  return Blaze.View(function() {
    return Spacebars.mustache(view.lookup("testTypeCasting"), "true", "false", true, false, 0, 1, -1, 10, -10);
  });
}));

Template.__define__("old_test_template_issue801", (function() {
  var view = this;
  return Blaze.Each(function() {
    return Spacebars.call(view.lookup("values"));
  }, function() {
    return Blaze.View(function() {
      return Spacebars.mustache(view.lookup("."));
    });
  });
}));

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
