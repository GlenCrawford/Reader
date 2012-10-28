Reader::Application.routes.draw do
  root :to => "application#index"
  match "proxy/*url" => "proxy#get", :via => :get, :format => false
  match "proxy/*url" => "proxy#post", :via => :post, :format => false
end
