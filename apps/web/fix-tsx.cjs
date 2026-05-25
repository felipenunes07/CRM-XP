const fs = require('fs');
let content = fs.readFileSync('src/pages/DisparadorPage.tsx', 'utf8');

content = content.replace(
  '                      </p>\n                    </div>\n                  </div>\n                </div>\n              )}',
  '                      </p>\n                    </div>\n                  </div>\n                </div>\n                </div>\n              )}'
);

content = content.replace(
  '                      ))}\n                    </div>\n                  )}\n                </article>\n              )}',
  '                      ))}\n                    </div>\n                  )}\n                </div>\n                </div>\n              )}'
);

content = content.replace(
  '                      <div className="empty-state">\n                        Nenhum destinatário encontrado com os filtros atuais.\n                      </div>\n                    </div>\n                    </div>\n                  )}\n                </div>\n              )}',
  '                      <div className="empty-state">\n                        Nenhum destinatário encontrado com os filtros atuais.\n                      </div>\n                    </div>\n                  )}\n                </div>\n                </div>\n              )}'
);

content = content.replace(
  '                            )}\\n                          </div>\n                        </div>\n                      </div>\n                    </div>\n                  </div>\n                </article>\n              )}',
  '                            )}\n                          </div>\n                        </div>\n                      </div>\n                    </div>\n                  </div>\n                </div>\n                </div>\n              )}'
);

content = content.replace(
  '              </div>\n            </div>\n\n          </div>\n        </>\n      )}',
  '              </div>\n            </div>\n\n          </div>\n        </div>\n        </div>\n      )}'
);

fs.writeFileSync('src/pages/DisparadorPage.tsx', content);
