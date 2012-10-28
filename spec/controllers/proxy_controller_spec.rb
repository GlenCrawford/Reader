require 'spec_helper'

describe ProxyController do
  before do
    @mock_response_struct = Struct.new(:response, :body)

    @cookies = mock :cookies
    controller.stub(:cookies).and_return(@cookies)
  end

  describe :get do
    it "should send a GET request to the desired base URL with all params, and be successful" do
      @cookies.should_receive(:[]).once.with(:auth).and_return("my_auth_token")

      mock_response = @mock_response_struct.new(Struct.new(:code).new("200"), "The source of Google's home page.")
      HTTParty.should_receive(:get).once.with("http://www.google.com/?one=two&three=4", :headers => {
        "Authorization" => "GoogleLogin auth=my_auth_token"
      }).and_return(mock_response)

      get :get, :url => "http://www.google.com/?one=two&three=4"

      response.should be_success
      response.status.should == 200
      response.body.should == "The source of Google's home page."
    end

    it "should send a GET request to the desired base URL, and fail" do
      @cookies.should_receive(:[]).once.with(:auth).and_return("my_auth_token")

      mock_response = @mock_response_struct.new(Struct.new(:code).new("500"), "Internal Server Error")
      HTTParty.should_receive(:get).once.with("http://www.google.com/", :headers => {
        "Authorization" => "GoogleLogin auth=my_auth_token"
      }).and_return(mock_response)

      get :get, :url => "http://www.google.com/"

      response.should_not be_success
      response.status.should == 500
      response.body.should == "Internal Server Error"
    end

    it "should require a URL param" do
      lambda {
        get :get
      }.should raise_error(ActionController::RoutingError)
    end
  end

  describe :post do
    it "should send a POST request to the desired URL with all params, and be successful" do
      @cookies.should_receive(:[]).twice.with(:auth).and_return("my_auth_token")

      mock_response = @mock_response_struct.new(Struct.new(:code).new("200"), "The source of Google's home page.")
      HTTParty.should_receive(:post).once.with("http://www.google.com/", :body => {
        :one => "two",
        :three => "4"
      }, :headers => {
        "Authorization" => "GoogleLogin auth=my_auth_token"
      }).and_return(mock_response)

      post :post, :url => "http://www.google.com/", :one => "two", :three => "4"

      response.should be_success
      response.status.should == 200
      response.body.should == "The source of Google's home page."
    end

    it "should send a POST request to the desired URL, and fail" do
      @cookies.should_receive(:[]).once.with(:auth).and_return(nil)

      mock_response = @mock_response_struct.new(Struct.new(:code).new("500"), "Internal Server Error")
      HTTParty.should_receive(:post).once.with("http://www.google.com/", :body => {}, :headers => {}).and_return(mock_response)

      post :post, :url => "http://www.google.com/"

      response.should_not be_success
      response.status.should == 500
      response.body.should == "Internal Server Error"
    end

    it "should require a URL param" do
      lambda {
        post :post
      }.should raise_error(ActionController::RoutingError)
    end

    it "should send a POST request and then set part of the response in a cookie if the URL includes ClientLogin" do
      @cookies.should_receive(:[]).once.with(:auth).and_return(nil)
      @cookies.should_receive(:[]=).once.with(:auth, "my_auth_token")

      response_body = "SID=my_sid_token\n" +
                      "LSID=my_lsid_token\n" +
                      "Auth=my_auth_token\n"
      mock_response = @mock_response_struct.new(Struct.new(:code).new("200"), response_body)
      HTTParty.stub(:post).and_return(mock_response)

      post :post, :url => "https://www.google.com/accounts/ClientLogin"
    end
  end
end
